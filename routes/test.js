module.exports = {
    getHomePage: (req, res) => {
        let query = "SELECT * FROM `animeinfo` ORDER BY aid ASC"; // query database to get all the players

        // execute query
        db.query(query, (err, result) => {
            if (err) {
                res.redirect('/');
            }
            result = JSON.parse(JSON.stringify(result));
            console.log(result[0]['name']);
            // res.render('index.ejs', {
            //     title: "Welcome to Socka | View Players"
            //     ,players: result
            // });
        });
    },
};
