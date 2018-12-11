const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('promise-mysql');
const path = require('path');
var passport = require('passport')
    ,LocalStrategy = require('passport-local').Strategy;
var session = require('express-session');
var flash = require('connect-flash');
var search = require('youtube-search');
var axios = require('axios');
// var _ = require('lodash');
var connection = require('./lib/dbconn');
var youtubekey = require('./apikey');
var Store = require('express-session').Store;
// var BetterMemoryStore = require(__dirname + '/memory');
var app = express();
const port = process.env.PORT || 3000;
const {getHomePage} = require('./routes/test');

//for youtube paras
var opts = {
  maxResults: 1,
  key: youtubekey,
  type: 'video',
  videoEmbeddable: true,
  videoSyndicated: true
};

//express session store and expiration
// var store = new BetterMemoryStore({expires: 60*60*1000, debug:true});
app.use(session({
  secret: 'ANIMERECOMMENDATIONSYSTEM',
  resave: false,
  saveUninitialized: false
}));


//configure middleware
app.set('views', __dirname + '/views'); // set express to look in this folder to render our view
app.set('view engine', 'ejs'); // configure template engine
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json()); // parse form data client
app.use(express.static(path.join(__dirname, 'public'))); // configure express to use public folder
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());



passport.serializeUser( (user,done)=>{
  done(null,user.uid);
});

passport.deserializeUser((id, done)=>{
  connection.then( (conn)=>{
    var result = conn.query("select * from user where uid = "+id);
    // conn.end();
    return result;
  }).then( (rows)=>{
    done(null,rows[0]);
  });
});


  passport.use('local-signup', new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password',
    passReqToCallback: true
  }, (req,username,password,done)=>{
    if (!username || !password){
      return done(null,false, req.flash('message','All fields are required.'));
    }
      connection.then( (conn)=>{
        let query = "select * from user where username = '"+username+"'";
        var results = conn.query(query);
        return results;
      }).then( (rows) => {
          // if (err) { return done(req.flash('message',err));}
          if (rows.length){
            return done(null,false, req.flash('message','The username has been choosen.'));
          }else{
            var newUserMysql;
            //create a new user
            connection.then( (conn)=>{
              newUserMysql = new Object();
              newUserMysql.username = username;
              newUserMysql.password = password;

              var insertQuery = "insert into user (username,password) values ('"+username+"','"+password+"')";
              // console.log(insertQuery);
              var insertResult = conn.query(insertQuery);
              // conn.end();
              return insertResult;
            }).then( (rows)=>{
              console.log(rows);
              // console.log(rows[1]);
              newUserMysql.uid = rows.insertId;
              return done(null,newUserMysql);
            }).catch( (err)=>{

                  console.log(err);
                  return done(req.flash('message',err));
            });
          }
        }).catch( (err)=>{
          console.log(err);
          return done(req.flash('message',err));
        });

      }));


passport.use('local-login', new LocalStrategy({
  usernameField: 'username',
  passwordField: 'password',
  passReqToCallback: true
}, (req,username,password,done)=>{
  if (!username || !password){
    return done(null,false, req.flash('message','All fields are required.'));
  }
    connection.then( (conn)=>{
      var results = conn.query("select * from `user` where `username`='"+username+"'");
      // conn.end();
      return results;
    }).then( (rows)=>{
      // console.log(rows);
      // if (err) {return done(req.flash('message',err));}
      if (!rows.length){
        return done(null,false, req.flash('message','No user found.'));
      }
      if (!(rows[0].password == password)){
        return done(null,false, req.flash('message','Wrong password.'));
      }
      return done(null,rows[0]);
    }).catch( (err)=>{

          //logs out the error
          console.log(err);
          return done(req.flash('message',err));

    });
  }));

app.get('/', ensureAuth, getHomePage);

app.get('/signin', (req,res)=>{
  res.render('signin',{'message':req.flash('message')});
});

app.post('/signin',passport.authenticate('local-login',{
  successRedirect:'/itemcf',
  failureRedirect:'/signin',
  failureFlash: true}), (req,res,info)=>{
    res.render('signin',{'message':req.flash('message')});
  }
);

app.post('/register',passport.authenticate('local-signup',{
  successRedirect:'/start',
  failureRedirect:'/signin',
  failureFlash: true}), (req,res,info)=>{
    res.render('signin',{'message':req.flash('message')});
  }
);

// to show the page of start
app.get('/start', ensureAuth,(req,res)=>{
  //get top 10 with most rating count Animes
  connection.then( async conn=>{
    let query = "select * from animeinfo as a inner join (select aid from ratings group by aid order by count(*) Desc limit 10) as b where a.aid=b.aid";

    let result = await conn.query(query);
    // conn.end();

    if (!result.length){
      console.log('Data is not available.');
      return;
    }
    let animes = JSON.parse(JSON.stringify(result));

    //make ajax to get description based on each animes title
    // the api key is https://kitsu.io/api/edge/anime?filter[text]=animename
    let animeName = result.map( val=>{return val.name;});
    // console.log(animeName);

    let animescriptionRaw = animeName.map( async val=>{
      let response = await axios.get('https://kitsu.io/api/edge/anime?filter[text]='+val);

      //some name is weired so don't have the related response
        if (response.data.data[0] == null){
          console.log('successful null');
          return 'Description Not Found';
        }else{
          let descri = response.data.data[0].attributes.synopsis;
          return descri;
        }
    });

    let animeDescription = await Promise.all(animescriptionRaw);
    res.render('start',{animes, animeDescription});
  });
});

app.post('/start', ensureAuth, (req,res)=>{
  // store the genres value into database
  connection.then( (conn)=>{
    var genre1 = req.body.genre1 ? JSON.stringify(req.body.genre1) : null;
    var genre2 = req.body.genre2 ? JSON.stringify(req.body.genre2) : null;
    var genre3 = req.body.genre3 ? JSON.stringify(req.body.genre3) : null;
    let genreQuery = "update user set genre1="+genre1+", genre2="+genre2+", genre3="+genre3+" where uid="+req.user.uid;
    var result1 = conn.query(genreQuery);

    //store the rating made by user
    req.body = JSON.parse(JSON.stringify(req.body));
    results2 = [];
    for(var key in req.body) {

      if(req.body.hasOwnProperty(key)) {
        if (key.startsWith("rating")) {
          //parse the aid
           var aid = key.slice(6,);
           var rating = req.body[key];
           let ratingQuery = "insert into ratings (uid,aid,rating) values ("+req.user.uid+",'"+aid+"','"+rating+"')";
           var result2 = conn.query(ratingQuery);
           results2.push(result2);
         }
       }
     }

    // conn.end();
    return [result1,results2];

  }).then( (rows)=>{
    // console.log('successfully updated genres of users');
    // console.log('successfully updated the ratings of users');
    res.redirect('/itemcf');
  }).catch( (err)=>{
    console.log(err);
  });
});


app.get('/itemcf', ensureAuth, (req,res)=>{
  var connectMysql;

  //get what current user rated
  connection.then( async (conn)=>{
    connectMysql = conn;
    let ratedAnimeQuery = "select aid, rating from ratings where uid="+req.user.uid;
    let unratedAnimeQuery = "select distinct aid from ratings where aid not in (select distinct aid from ratings where uid="+req.user.uid+")";
    var rawData = await Promise.all([connectMysql.query(ratedAnimeQuery), connectMysql.query(unratedAnimeQuery)]);

    let ratedID = rawData[0].map( val=>{ return val.aid; });
    let ratedRating = rawData[0].map( val=>{ return val.rating;});
    let unratedID = rawData[1].map( val=>{ return val.aid; });
    console.log('the user rated as below:');
    console.log(ratedID);

    //now we have each rated and unrated anime id, we try to compute the similarity for each unrated with rated
    var predictRatingList = unratedID.reduce( async (previousPromise,unAid,index,array)=>{

      let dict = await previousPromise;

      var similarityWithRated = ratedID.map( async (aid)=>{

        // let mutualUserQuery = "select avg(rating) as rating from ratings where uid in (select uid from ratings where uid in (select uid from ratings where aid="+aid+") and uid in (select uid from ratings where aid="+unAid+")) group by uid";
        let ratedmutualQuery = "select rating from ratings where aid ="+aid+" and uid in (select uid from ratings where uid in (select uid from ratings where aid="+aid+") and uid in (select uid from ratings where aid="+unAid+"))";
        let unratedmutualQuery = "select rating from ratings where aid ="+unAid+" and uid in (select uid from ratings where uid in (select uid from ratings where aid="+aid+") and uid in (select uid from ratings where aid="+unAid+"))";
        var mutualRawData = await Promise.all([connectMysql.query(ratedmutualQuery), connectMysql.query(unratedmutualQuery)]);
        // console.log(mutualRawData[2]);

        //adjusted cosine similarity with consideration of each user's preference
        // console.log(mutualRawData[2]);

          if (mutualRawData[0].length<=3 || mutualRawData[1].length<=3){
            return 0;
          }else{

            // let avgPerUserRating = mutualRawData[2].map(val=>{return Math.floor(val.rating*100)/100;});
            let ratedMutualRating = mutualRawData[0].map( (val,index)=>{ return val.rating; });
            let unratedMutualRating = mutualRawData[1].map( (val,index)=>{ return val.rating; });
            // console.log(avgPerUserRating);
            // console.log(ratedMutualRating);

            //calculate consine similarity

            let bottom1 = Math.sqrt(ratedMutualRating.reduce( (accumlator,nextvalue)=>{ return accumlator+Math.floor(Math.pow(nextvalue,2)*100)/100; }, 0));

            let bottom2 = Math.sqrt(unratedMutualRating.reduce( (accumlator,nextvalue)=>{ return accumlator+Math.floor(Math.pow(nextvalue,2)*100)/100; }, 0));
            let top = ratedMutualRating.reduce( (accumlator, nextvalue, nextindex)=>{ return accumlator+(nextvalue)*(unratedMutualRating[nextindex]); },0);
            // console.log('bottom1 is '+bottom1+' bottom2 is '+bottom2+' and top is '+top);
            let cosinevalue = top / (bottom1*bottom2);
            // console.log(cosinevalue);
            return cosinevalue;

          }

      });

      let resolvedSimilarityWithRated = await Promise.all(similarityWithRated);
      console.log('the cosinevalue is :');
      console.log(resolvedSimilarityWithRated);

      //compute the predicted rating for each unrated anime
      let predictedTop = ratedRating.reduce( (accumlator, nextvalue, nextindex)=>{ return accumlator+nextvalue*resolvedSimilarityWithRated[nextindex]; }, 0);
      let bottomPredictRating = resolvedSimilarityWithRated.reduce( (acc, val)=>{ return acc + Math.abs(val); }, 0);
      if (bottomPredictRating == 0){

      }else{
        let predictRating = predictedTop / bottomPredictRating;
        dict[unAid]=predictRating;
      }
      // let predictRating = predictedTop / bottomPredictRating;
      // console.log(predictRating);


      // if (!(unAid in accOuter)){
      // dict[unAid]=predictRating;
      // }
      // console.log(dict);
      return dict;
    }, Promise.resolve({}));

    // console.log(predictRatingList);

    //where the question is ???
    let resolvedPredictRating = await predictRatingList;
    // let resolvedPredictRating = _.zipObject(_.keys(predictRatingList), await Promise.all(_.values(predictRatingList)));

    // console.log(resolvedPredictRating);

    //calculate the top 10 predicted rating's anime aid
    var keysSorted = Object.keys(resolvedPredictRating).sort(function(a,b){return resolvedPredictRating[b]-resolvedPredictRating[a]});
    console.log("the final result for anime is =========");
    console.log(keysSorted);

    //based on the key get top 10 result and get their information from database
    let topTen = keysSorted.slice(0,10);
    let itemCFResultRaw = topTen.map( val=>{
      let getCFAnimes = "select * from animeinfo where aid="+val;
      let cfAnimesRaw = connectMysql.query(getCFAnimes);
      return cfAnimesRaw;
    });

    let itemCFAnimes = await Promise.all(itemCFResultRaw);
    let itemCFAnimesOutput = itemCFAnimes.map( val=>{
      return JSON.parse(JSON.stringify(val[0]));
    })
    // console.log(itemCFAnimesOutput);


    // recommend based on user's genre, based on average ratings
    let getUserGenreQuery = "select genre1, genre2, genre3 from user where uid = "+req.user.uid;
    let userGenresRawData = await connectMysql.query(getUserGenreQuery);
    // let userGenres = JSON.parse(JSON.stringify(userGenresRawData))[0];
    let userGenres = userGenresRawData.reduce( (acc,val,index)=>{
      if (val.genre1){
        acc.push(val.genre1);
      }
      if (val.genre2){
        acc.push(val.genre2);
      }
      if (val.genre3){
        acc.push(val.genre3);
      }
      return acc;
    },[]);
    // console.log(userGenres);

    //to check each genre top 3 rating Animes
    let genresResultPromise = userGenres.map( async val=>{
      let eachGenreTopRatingAnime = "select * from animeinfo where genre like '%"+val+"%' order by rating Desc limit 5";
      let eachAnimeRawData = await connectMysql.query(eachGenreTopRatingAnime);
      return eachAnimeRawData;
    });

    let genresResultRaw = await Promise.all(genresResultPromise);
    // console.log(genresResultRaw);
    // make genres no dublicates
    var aidPool = [];
    let genresResult = genresResultRaw.reduce( (acc,val)=>{
      let animesForEachGenre = val.map( val=>{ return JSON.parse(JSON.stringify(val));});
      animesForEachGenre.forEach( val=>{
        if (aidPool.includes(val.aid)){
          console.log("duplicates");
        }else{
          acc.push(val);
          aidPool.push(val.aid);
        }
      });
      return acc;
    },[]);

    // console.log(genresResult);
    //generate outputs
    // var output = {};
    // output.genre = genresResult;
    // output.cf = itemCFAnimesOutput;
    // console.log(output);

    //get user id and name
    let usernameQuery = 'select username from user where uid='+req.user.uid;
    let usernameRaw = await connectMysql.query(usernameQuery);
    let user = usernameRaw.reduce( (acc,val)=>{
      acc['username'] = val.username;
      return acc;
    },{uid:req.user.uid});

    // console.log(user);

    //get trending anime with top 10 members anime
    let top10membersQuery = 'select aid, name, type, duration, image, genre from animeinfo order by members Desc limit 30';
    let trendanimeRaw = await connectMysql.query(top10membersQuery);
    let trendanimes = JSON.parse(JSON.stringify(trendanimeRaw));
    console.log(trendanimes);
    // let trendanimes = trendanimeRaw.map( val=>{ return {aid:val.aid, name:val.name, img: val.image, type:val.type, length:val.duration, genres:val.genres }; });
    res.render('index', {genre:genresResult, cf:itemCFAnimesOutput, user:user, trending:trendanimes});


  });

});

//show details of animes
app.get('/anime/:aid', ensureAuth,(req,res)=>{
  connection.then( async conn=>{
    let getAnimeInfoQuery = "select * from animeinfo where aid="+req.params.aid;
    let animeRawData = await conn.query(getAnimeInfoQuery);
    let animes = JSON.parse(JSON.stringify(animeRawData))[0];
    let userRatedQuery = "select rating from ratings where aid="+req.params.aid+" and uid="+req.user.uid;
    let userRatedRaw = await conn.query(userRatedQuery);
    // console.log(userRatedRaw);
    let animeName = animes.name;

    //to get the description
    let response = await axios.get('https://kitsu.io/api/edge/anime?filter[text]='+animeName);
      //some name is weired so don't have the related response
    var description = 'description not found';
    if (response.data.data[0] == null){
        // console.log('successful null');
    }else{
        let descri = response.data.data[0].attributes.synopsis;
        description = descri;
    }

    search(animeName, opts, function(err, results) {
      if(err) return console.log(err);

      // console.log(results[0].id);

      if (userRatedRaw.length == 0){
        let rated = null;
        res.render('detail', {animes, rated, description, youtubeid:results[0].id});

      }else{
        let rated = "button"+userRatedRaw[0].rating;
        res.render('detail', {animes, rated, description, youtubeid:results[0].id});
        // console.log(rated);
      }

    });
  });

});

app.post('/saverating/:aid', ensureAuth, (req,res)=>{
  connection.then( async conn=>{
    // console.log(req.params.aid);
    // console.log(req.user.uid);
    // console.log(req.body.selected);

    let insertRatingQuery = "insert into ratings (uid,aid,rating) values ("+req.user.uid+","+req.params.aid+","+req.body.selected+")";
    let updateRatingQuery = "update ratings set rating="+req.body.selected+" where uid="+req.user.uid+" and aid="+req.params.aid;
    if (req.body.rated == ''){
      //use insert
      console.log('insert');
      let rows = await conn.query(insertRatingQuery);
      if (rows.length!==0){
        //successful
        res.redirect('/anime/'+req.params.aid);
      }
    }else{
      //use update
      console.log('update');
      let rows = await conn.query(updateRatingQuery);
      if (rows.length!==0){
        res.redirect('/anime/'+req.params.aid);
      }
    }
  });
});


//to display user Profile // middleware should be added to check
app.get('/user/:uid', ensureAuth, (req, res)=>{
  //check if current user genres and display them
  connection.then( async conn=>{
    // console.log('start');
    let getUserGenresQuery = 'select username, genre1, genre2, genre3 from user where uid='+req.user.uid;
    let userRawData = await conn.query(getUserGenresQuery);
    let user = userRawData.reduce( (acc,val)=>{
      acc['username']=val.username;
      acc['genre1']=val.genre1;
      acc['genre2']=val.genre2;
      acc['genre3']=val.genre3;
      return acc;
    },{uid:req.user.uid});
    // console.log(user);

    res.render('user',{user});

  });

});

//to update user Profile
app.post('/user/:uid', ensureAuth, (req,res)=>{

  var genres = JSON.parse(JSON.stringify(req.body.genre));

  var genre1,genre2,genre3;
  // console.log(typeof genres);
  var typeOfIncoming = typeof genres;
  if (typeOfIncoming instanceof Object || typeOfIncoming === 'object'){

    genre1 = genres[0] ? JSON.stringify(genres[0]) : null;
    genre2 = genres[1] ? JSON.stringify(genres[1]) : null;
    genre3 = genres[2] ? JSON.stringify(genres[2]) : null;
  }else if (typeOfIncoming instanceof String || typeOfIncoming === 'string') {
    genre1 = genres ? JSON.stringify(genres) : null;
    genre2 = null;
    genre3 = null;
  }

  connection.then( async conn=>{
    let updateUserGenresQuery = 'update user set genre1='+genre1+', genre2='+genre2+', genre3='+genre3+' where uid='+req.user.uid;
    let rows = await conn.query(updateUserGenresQuery);
    // console.log(rows);

    res.redirect('/user/'+req.user.uid);

  });

});

//Logout
app.get('/signout', (req,res)=>{
  req.logout();
  res.redirect('/signin');

});



// fix the algorithm for adjust cosine


// mysql index

  //build cosine similarity matrix for rated and unrated animes
  //calculate each unrated animes' predicted rating based on matrix
  // rank to get top 10 ratings' anime and get the related data from database
  //render the page of detail with these data



function ensureAuth(req,res,next){
  if (req.isAuthenticated()){
    return next();
  }
  res.redirect('/signin');
}

app.listen(port, ()=>{
  console.log('The app started...')
});
