const mysql = require('mysql2');

const db = mysql.createConnection({
    host:'sql10.freesqldatabase.com',
    port:3306, // MySQL port
    user:'sql10798699',
    password:'1eW9v4aCgn', // Add your password here
    database:'sql10798699'
    // host:'localhost',
    // port:3306, //Add your MySQL port here
    // user:'root',
    // database:'orbitdb'
});

db.connect((err) => {
    if (err){
        console.error('Database connection failed: ' + err.stack);
        return;
    }
    console.log('Connected to MySQL database.');
});

module.exports=db;
