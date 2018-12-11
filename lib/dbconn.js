var mysql = require('promise-mysql');

//create connection to database
var connection = mysql.createConnection ({
    host: 'localhost',
    user: 'root',
    password: '',
    database:  'anime_smaller'
});
//  'anime_project''anime_smaller''anime_project'
module.exports = connection;
