const express =require('express');
const nodemailer =require('nodemailer');
const validator = require("validator"); // npm install validator
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const http = require('http'); // ✅ declare before using
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise'); // Promise-based MySQL
const bcrypt = require('bcrypt');
const db = require('./db');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const cors = require('cors');
const app = express();
const server = http.createServer(app); // now http is defined
const cookieParser = require('cookie-parser');
const port = process.env.PORT || 4000 
const JWT_SECRET ='bazirake';
    // Node HTTP server
app.use(cookieParser()); 
// Middleware
 const allowedOrigins = [
  'https://orbitclass.vercel.app', // production
  'http://localhost:3000',         // development
];


app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (mobile apps, curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // if you need cookies or auth headers
}));
// Important for parsing non-file fields
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// configure storage
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, 'uploads/'),
//   filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
// });

// ✅ Ensure 'uploads' folder exists
fs.mkdirSync('uploads', { recursive: true });

// ✅ Configure multer storage
const storage =multer.diskStorage({
  destination:(req, file, cb)=>cb(null, 'uploads/'),
  filename:(req, file, cb)=>cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    database: 'orbitdb',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});


app.use(bodyParser.json());
app.use(express.json());
// Enable CORS with credentials
// app.use(cors({
//     origin:allowedOrigins, // your frontend URL
//     credentials:true // allow cookies
// }));




// Test route

// app.listen(port, () => {
//   console.log(`http://localhost:${port}`)
//   console.log("welcome")
// })

 

//JWT Authentication Middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.token; // from cookie-parser
  if (!token) return res.status(401).json({ message: 'Access denied not token has been provided' });

  jwt.verify(token,JWT_SECRET,(err,user) => {
    if (err) return res.status(403).json({message:'Invalid or expired token'});
     req.user = user;
    next();
  });
}

// login


app.post('/login', async (req, res) => {
  const { studentnumber, password } = req.body;

  db.query(
    `SELECT account.*, 
            c.description as levels,
            department.department_name,
            user_type.type_name,
            user_type.description as user_type_description,
            c.level_id,
            department.department_id
     FROM account
     INNER JOIN department ON account.DEPARTMENT = department.department_id
      LEFT JOIN level c ON c.level_id = account.CLASSES
     INNER JOIN user_type ON account.USERTYPE = user_type.user_type_id
     WHERE account.studentnumber = ? AND account.PASSWORD=?`,
    [studentnumber,password],  // ✅ parameters array
    async (err,results) => {
      if(err) {
        console.error('DB error:', err);
        return res.status(500).json({ message: 'Database error', error: err });
      }

      if(results.length === 0) {
        return res.status(401).json({ message: 'Invalid student number or password' });
      }

      const user = results[0];

      // if (!user.PASSWORD) {
      //   return res.status(500).json({ message: 'Password field missing for this account' });
      // }
      // try {
      //   const isMatch = await bcrypt.compare(password, user.PASSWORD);
      //   if (!isMatch) {
      //     return res.status(401).json({ message: 'Invalid student number or password' });
      //   }

        const userDetails = {
          id: user.ID,
          email: user.EMAIL,
          usertype: user.USERTYPE,
          studentnumber: user.studentnumber,
          fullname: user.FULLNAME,
          classes: user.CLASSES,
          tel: user.TEL,
          department_id: user.department_id,
          department_name: user.department_name,
          type_name: user.type_name,
          levels: user.levels,
          level_id:user.level_id
        };

        const token = jwt.sign(userDetails, JWT_SECRET, { expiresIn: '1h' });
        res.cookie('token',token,{
          httpOnly: true,
          secure: true,      // true on production HTTPS
          sameSite: 'none',
          maxAge: 60 * 60 * 60 * 1000
        });

        res.json({
          message: 'Logged in successfully',
          user: userDetails
        });
    }
  );
});
 //get all menue
app.get('/api/menu',authenticateToken, (req, res) => {
  const sql = 'SELECT * FROM menu_items';
  db.query(sql, (err,menuItems) => {
    if(err){
      console.error('Error fetching menu items:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    //Combine menu items + user details
    res.json({
       menuItems
    });
  });
});


//get menu by userty
app.get('/api/menus',authenticateToken,(req, res) => {
  const usertype =req.query.usertype;// ?usertype=admin
  let sql = 'SELECT i.id,i.label,i.href,i.icon,i.usertype FROM menu_items i INNER JOIN menuaccount a on i.id=a.menuid';
  let params = [];
  if (usertype) {
    sql +=' WHERE a.usertypeid=?';
    params.push(usertype);
  }
  db.query(sql,params,(err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
        res.json({
       results
    });
  });
});




// API endpoint
app.get("/menu/:usertypeid", (req, res) => {
  const usertypeid = req.params.usertypeid;

  const sql = `
    SELECT i.id, i.label, i.href, i.icon, i.usertype
    FROM menu_items i
    INNER JOIN menuaccount a ON i.id = a.menuid
    WHERE a.usertypeid = ?
  `;

  db.query(sql, [usertypeid], (err, results) => {
    if (err) {
      console.error("Error executing query:", err);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token',{
    httpOnly: true,
    secure: true,
    sameSite:'none'//cross-domain
  });
  res.json({ message: 'Logged out' });
});

//Protect Timetable API
// app.get('/timetable/level/:level', authenticateToken, (req, res) => {
//     const { level } = req.params;
//     db.query(
//         `SELECT t.*, c.title AS course_title 
//          FROM timetable t 
//          JOIN courses c ON t.course_id = c.id
//          WHERE t.level = ?`,
//         [level],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json(results);
//         }
//     );
// });

//Protect Quiz APIs
//Take Quiz / Submit Answers
// app.post('/quiz_attempts/:quizId/answers', authenticateToken, (req, res) => {
//     const { quizId } = req.params;
//     const student_id = req.user.id; // use logged-in user ID
//     const { question_id, selected_choice_id, answer_text, marks_awarded } = req.body;

//     db.query(
//         `INSERT INTO student_answers (attempt_id, question_id, selected_choice_id, answer_text, marks_awarded)
//          VALUES ((SELECT id FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?), ?, ?, ?, ?)`,
//         [quizId, student_id, question_id, selected_choice_id, answer_text, marks_awarded],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json({ message: 'Answer submitted', id: results.insertId });
//         }
//     );
// });

//Protect Chat API
// Send message
// app.post('/chat', authenticateToken, (req, res) => {
//     const { message, recipient_id } = req.body;
//     const sender_id = req.user.id;

//     db.query(
//         `INSERT INTO chat (sender_id, recipient_id, message) VALUES (?, ?, ?)`,
//         [sender_id, recipient_id, message],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json({ message: 'Message sent', id: results.insertId });
//         }
//     );
// });

// Get messages
// app.get('/chat', authenticateToken, (req, res) => {
//     const user_id = req.user.id;

//     db.query(
//         `SELECT * FROM chat WHERE sender_id = ? OR recipient_id = ? ORDER BY created_at ASC`,
//         [user_id, user_id],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json(results);
//         }
//     );
// });


// Example login Define Roles in JWT
// const token = jwt.sign(
//     { id: user.id, email: user.email, usertype: user.usertype }, // include role
//     'your_jwt_secret',
//     { expiresIn: '1h' }
// );

// function authorizeRoles(...allowedRoles) {
//     return (req, res, next) => {
//         const userRole = req.user.usertype; // from JWT
//         if (!allowedRoles.includes(userRole)) {
//             return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
//         }
//         next();
//     };
// }

//This middleware can take one or more roles, e.g., ['admin', 'teacher'].
//Only Admin or Teacher Can Create Quiz
// app.post('/quizzes', authenticateToken, authorizeRoles('admin', 'teacher'), (req, res) => {
//     const { title, description, course_id, level, duration } = req.body;

//     db.query(
//         `INSERT INTO quizzes (title, description, course_id, level, duration) VALUES (?, ?, ?, ?, ?)`,
//         [title, description, course_id, level, duration],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json({ message: 'Quiz created', quiz_id: results.insertId });
//         }
//     );
// });

//Only Students Can Attempt Quizzes
// app.post('/quiz_attempts/:quizId/answers', authenticateToken, authorizeRoles('student'), (req, res) => {
//     const { quizId } = req.params;
//     const student_id = req.user.id;
//     const { question_id, selected_choice_id, answer_text, marks_awarded } = req.body;

//     db.query(
//         `INSERT INTO student_answers (attempt_id, question_id, selected_choice_id, answer_text, marks_awarded)
//          VALUES ((SELECT id FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?), ?, ?, ?, ?)`,
//         [quizId, student_id, question_id, selected_choice_id, answer_text, marks_awarded],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json({ message: 'Answer submitted', id: results.insertId });
//         }
//     );
// });

// //Only Admin Can Manage Timetable
// app.post('/timetable', authenticateToken, authorizeRoles('admin'), (req, res) => {
//     const { course_id, day, start_time, end_time, description, level, classes } = req.body;

//     db.query(
//         `INSERT INTO timetable (course_id, day, start_time, end_time, description, level, classes)
//          VALUES (?, ?, ?, ?, ?, ?, ?)`,
//         [course_id, day, start_time, end_time, description, level, classes],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json({ message: 'Timetable entry created', id: results.insertId });
//         }
//     );
// });


// Login route
// app.post('/login', (req, res) => {
//     const { email, password } = req.body;

//     // 1. Check if user exists
//     db.query(
//         `SELECT * FROM accounts WHERE email = ?`,
//         [email],
//         async (err, results) => {
//             if (err) return res.status(500).send(err);
//             if (results.length === 0) return res.status(401).json({ message: 'Invalid email or password' });

//             const user = results[0];

//             // 2. Compare password
//             const isMatch = await bcrypt.compare(password, user.password);
//             if (!isMatch) return res.status(401).json({ message: 'Invalid email or password' });

//             // 3. Generate JWT token
//             const token = jwt.sign(
//                 { id: user.id, email: user.email, usertype: user.usertype },
//                 'your_jwt_secret', // replace with process.env.JWT_SECRET in production
//                 { expiresIn: '1h' }
//             );

//             res.json({
//                 message: 'Login successful',
//                 token,
//                 user: {
//                     id: user.id,
//                     fullname: user.fullname,
//                     email: user.email,
//                     usertype: user.usertype
//                 }
//             });
//         }
//     );
// });

// Add new account
app.post('/createaccount', async (req, res) => {

    try {
        const { fullname, department, classes, studentnumber, email, password, usertype, tel } = req.body;
        // hash password before storing
       // const hashedPassword = await bcrypt.hash(password, 10);
        db.query(
            `INSERT INTO account
            (fullname,department,classes,studentnumber,email,password,usertype,tel) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [fullname, department, classes, studentnumber, email, password, usertype, tel],
            (err, results) => {
                if(err) return res.status(500).send(err);
                res.json({ 
                message:"Account created successfully" 
                });        
            }
        );
    } catch (error) {
        res.status(500).json({ message: 'Error creating account', error });
    }
});


// Add new course
app.post('/addcourse', authenticateToken,(req, res) => {
    const { title, descriptions, instructor, department, classes, studentnumber } = req.body;

    db.query(
        `INSERT INTO courses (title, descriptions, instructor, department, classes, studentnumber) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [title, descriptions, instructor, department, classes, studentnumber],
        (err, results) => {
            if (err) return res.status(500).send(err);
            res.json({
                id: results.insertId,
                title,
                descriptions,
                instructor,
                department,
                classes,
                studentnumber,
                created_at:new Date()
            });
        }
    );
});

// create a time table
// app.post('/addtimetable',(req, res) => {
//     const { course_id, day, start_time, end_time, description, level, classes } = req.body;
//     db.query(
//         `INSERT INTO timetable (course_id, day,start_time, end_time,description,level,classes) 
//          VALUES (?, ?, ?, ?, ?, ?, ?)`,
//         [course_id,day,start_time,end_time,description,level,classes],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json({
//                 id: results.insertId,
//                 course_id,
//                 day,
//                 start_time,
//                 end_time,
//                 description,
//                 level,
//                 classes,
//                 created_at: new Date()
//             });
//         }
//     );
// });


//get timetable by year of study
// app.get('/timetable/level/:level', (req, res) => {
//     const { level } = req.params;
//     db.query(
//         `SELECT 
//             t.id,
//             t.course_id,
//             t.day,
//             DATE_FORMAT(t.start_time, '%h:%i %p') AS start_time,
//             DATE_FORMAT(t.end_time, '%h:%i %p') AS end_time,
//             t.description,
//             t.level,
//             t.classes,
//             c.title AS course_title
//          FROM timetable t 
//          JOIN courses c ON t.course_id = c.id
//          WHERE t.level = ?`,
//         [level],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json(results);
//         }
//     );
// });


//get time table by day
// app.get('/timetable/day/:day', (req, res) => {
//     const { day } = req.params;
//     db.query(
//         `SELECT 
//             t.id,
//             t.course_id,
//             t.day,
//             DATE_FORMAT(t.start_time, '%h:%i %p') AS start_time,
//             DATE_FORMAT(t.end_time, '%h:%i %p') AS end_time,
//             t.description,
//             t.level,
//             t.classes,
//             c.title AS course_title
//          FROM timetable t
//          JOIN courses c ON t.course_id = c.id
//          WHERE t.day = ?`,
//         [day],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json(results);
//         }
//     );
// });

//create menue by users access right
app.post('/createmenu', (req, res) => {
    const {names,usertype,urls}=req.body;

    db.query(
        `INSERT INTO menue (names, usertype, urls) VALUES (?, ?, ?)`,
        [names, usertype, urls],
        (err, results) => {
            if (err) return res.status(500).send(err);
            res.json({
                id: results.insertId,
                names,
                usertype,
                urls,
                created_at: new Date()
            });
        }
    );
});

 //get menu by type
app.get('/menu/usertype/:usertype',authenticateToken,(req, res) => {
    const { usertype } = req.params;
     
    db.query(
        `SELECT * FROM menue WHERE usertype = ?`,
        [usertype],
        (err, results) => {
            if (err) return res.status(500).send(err);
            res.json(results);
        }
    );
});

//get all menues for supper users
// app.get('/allmenu', (req, res) =>{
//     db.query(`SELECT * FROM menue`,(err, results) => {
//         if(err) return res.status(500).send(err);
//         res.json(results);
//     });
// });

// //create a new chat
// app.post('/createchat', (req, res) => {
//     const { sender_id, receiver_id, message} = req.body;

//     db.query(
//         `INSERT INTO chat (sender_id, receiver_id, message) VALUES (?, ?, ?)`,
//         [sender_id, receiver_id, message],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json({
//                 id: results.insertId,
//                 sender_id,
//                 receiver_id,
//                 message,
//                 read_status: false,
//                 created_at: new Date()
//             });
//         }
//     );
// });

// //Mark Messages as Read
// app.put('/chat/read/:receiver_id', (req, res) => {
//     const { receiver_id } = req.params;
//     db.query(
//         `UPDATE chat SET read_status = TRUE WHERE receiver_id = ? AND read_status = FALSE`,
//         [receiver_id],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json({ message: 'Messages marked as read' });
//         }
//     );
// });


// //Add a Quiz
// app.post('/quizzes', (req, res) => {
//     const { title, description, course_id, level, duration } = req.body;

//     db.query(
//         `INSERT INTO quizzes (title, description, course_id, level, duration) VALUES (?, ?, ?, ?, ?)`,
//         [title, description, course_id, level, duration],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json({ id: results.insertId, title, description, course_id, level, duration, created_at: new Date() });
//         }
//     );
// });

// //Add Questions to a Quiz
// app.post('/quizzes/:quizId/questions', (req, res) => {
//     const { quizId } = req.params;
//     const { question_text, marks } = req.body;

//     db.query(
//         `INSERT INTO questions (quiz_id, question_text, marks) VALUES (?, ?, ?)`,
//         [quizId, question_text, marks],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json({ id: results.insertId, quiz_id: quizId, question_text, marks, created_at: new Date() });
//         }
//     );
// });

// //Get Quiz with Questions
// app.get('/quizzes/:quizId', (req, res) => {
//     const { quizId } = req.params;
//     db.query(
//         `SELECT q.id AS quiz_id, q.title, q.description, q.duration, qs.id AS question_id, qs.question_text, qs.marks
//          FROM quizzes q
//          LEFT JOIN questions qs ON q.id = qs.quiz_id
//          WHERE q.id = ?`,
//         [quizId],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json(results);
//         }
//     );
// });

// //Example JSON Request to Add a Question
// // {
// //   "question_text": "What is Node.js?",
// //   "marks": 5
// // }

// //This table tracks each student’s attempt:

// //Record a Student Starting a Quiz
// app.post('/quizzes/:quizId/start', (req, res) => {
//     const{quizId} =req.params;
//     const{student_id}=req.body;
//     db.query(
//         `INSERT INTO quiz_attempts (quiz_id, student_id) VALUES (?, ?)`,
//         [quizId, student_id],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json({ attempt_id: results.insertId, quiz_id: quizId, student_id, started_at: new Date() });
//         }
//     );
// });


// //Update Score After Completion
// app.put('/quizzes/:quizId/complete', (req, res) => {
//     const { quizId } = req.params;
//     const { student_id, score } = req.body;
//     db.query(
//         `UPDATE quiz_attempts 
//          SET score = ?, completed_at = NOW() 
//          WHERE quiz_id = ? AND student_id = ?`,
//         [score, quizId, student_id],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json({ message: 'Quiz completed', quiz_id: quizId, student_id, score });
//         }
//     );
// });

// //Get All Students Who Took a Quiz
// app.get('/quizzes/:quizId/students', (req, res) => {
//     const { quizId } = req.params;
//     db.query(
//         `SELECT a.id AS student_id, a.fullname, a.email, qa.score, qa.started_at, qa.completed_at
//          FROM quiz_attempts qa
//          JOIN accounts a ON qa.student_id = a.id
//          WHERE qa.quiz_id = ?`,
//         [quizId],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json(results);
//         }
//     );
// });

// //JSON Request: Start a Quiz
// //{
// //  "student_id": 5
// //}

// //JSON Request: Complete a Quiz
// //{
// //  "student_id": 5,
// //  "score": 45
// //}

// //Record an Answer for a Question
// app.post('/quiz_attempts/:attemptId/answers', (req, res) => {
//     const { attemptId } = req.params;
//     const { question_id, selected_choice_id, answer_text, marks_awarded } = req.body;

//     db.query(
//         `INSERT INTO student_answers (attempt_id, question_id, selected_choice_id, answer_text, marks_awarded)
//          VALUES (?, ?, ?, ?, ?)`,
//         [attemptId, question_id, selected_choice_id, answer_text, marks_awarded],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json({
//                 id: results.insertId,
//                 attempt_id: attemptId,
//                 question_id,
//                 selected_choice_id,
//                 answer_text,
//                 marks_awarded
//             });
//         }
//     );
// });


// //Get All Answers for a Student Attempt
// app.get('/quiz_attempts/:attemptId/answers', (req, res) => {
//     const { attemptId } = req.params;

//     db.query(
//         `SELECT sa.*, q.question_text, c.choice_text AS selected_choice
//          FROM student_answers sa
//          JOIN questions q ON sa.question_id = q.id
//          LEFT JOIN choices c ON sa.selected_choice_id = c.id
//          WHERE sa.attempt_id = ?`,
//         [attemptId],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json(results);
//         }
//     );
// });

// //Update Score for Quiz Attempt Automatically
// //You can sum all marks_awarded from student_answers and update quiz_attempts:
// app.put('/quiz_attempts/:attemptId/complete', (req, res) => {
//     const { attemptId } = req.params;
//     db.query(
//         `SELECT SUM(marks_awarded) AS total_score FROM student_answers WHERE attempt_id = ?`,
//         [attemptId],
//         (err, results) => {
//             if (err) return res.status(500).send(err);

//             const total_score = results[0].total_score || 0;

//             db.query(
//                 `UPDATE quiz_attempts SET score = ?, completed_at = NOW() WHERE id = ?`,
//                 [total_score, attemptId],
//                 (err2) => {
//                     if (err2) return res.status(500).send(err2);
//                     res.json({ message: 'Quiz completed', attempt_id: attemptId, total_score });
//                 }
//             );
//         }
//     );
// });

// //Get Students with Scores
// app.get('/quizzes/:quizId/students', (req, res) => {
//     const { quizId } = req.params;

//     db.query(
//         `SELECT 
//             a.id AS student_id,
//             a.fullname,
//             a.email,
//             qa.score,
//             qa.started_at,
//             qa.completed_at
//          FROM quiz_attempts qa
//          JOIN accounts a ON qa.student_id = a.id
//          WHERE qa.quiz_id = ?`,
//         [quizId],
//         (err, results) => {
//             if (err) return res.status(500).send(err);
//             res.json(results);
//         }
//     );
// });


// //Full Quiz Report
// app.get('/quizzes/:quizId/report', (req, res) => {
//     const { quizId } = req.params;

//     // 1. Get all students who attempted the quiz
//     db.query(
//         `SELECT 
//             qa.id AS attempt_id,
//             a.id AS student_id,
//             a.fullname,
//             a.email,
//             qa.score,
//             qa.started_at,
//             qa.completed_at
//          FROM quiz_attempts qa
//          JOIN accounts a ON qa.student_id = a.id
//          WHERE qa.quiz_id = ?`,
//         [quizId],
//         (err, students) => {
//             if (err) return res.status(500).send(err);

//             if (students.length === 0) return res.json([]);

//             // 2. For each student attempt, get their answers
//             const attemptIds = students.map(s => s.attempt_id);

//             db.query(
//                 `SELECT 
//                     sa.attempt_id,
//                     sa.question_id,
//                     q.question_text,
//                     sa.selected_choice_id,
//                     c.choice_text AS selected_choice,
//                     sa.answer_text,
//                     sa.marks_awarded
//                  FROM student_answers sa
//                  JOIN questions q ON sa.question_id = q.id
//                  LEFT JOIN choices c ON sa.selected_choice_id = c.id
//                  WHERE sa.attempt_id IN (?)`,
//                 [attemptIds],
//                 (err2, answers) => {
//                     if (err2) return res.status(500).send(err2);

//                     // 3. Combine students with their answers
//                     const report = students.map(student => {
//                         const studentAnswers = answers
//                             .filter(a => a.attempt_id === student.attempt_id)
//                             .map(a => ({
//                                 question_id: a.question_id,
//                                 question_text: a.question_text,
//                                 selected_choice: a.selected_choice,
//                                 answer_text: a.answer_text,
//                                 marks_awarded: a.marks_awarded
//                             }));

//                         return {
//                             student_id: student.student_id,
//                             fullname: student.fullname,
//                             email: student.email,
//                             score: student.score,
//                             started_at: student.started_at,
//                             completed_at: student.completed_at,
//                             answers: studentAnswers
//                         };
//                     });

//                     res.json(report);
//                 }
//             );
//         }
//     );
// });



// //Get One Student’s Quiz Marks
// app.get('/quizzes/:quizId/student/:studentId', (req, res) => {
//     const { quizId, studentId } = req.params;

//     // 1. Get the student's quiz attempt
//     db.query(
//         `SELECT * FROM quiz_attempts 
//          WHERE quiz_id = ? AND student_id = ?`,
//         [quizId, studentId],
//         (err, attempts) => {
//             if (err) return res.status(500).send(err);
//             if (attempts.length === 0) return res.status(404).json({ message: 'Student has not taken this quiz' });

//             const attempt = attempts[0];

//             // 2. Get the student's answers for this attempt
//             db.query(
//                 `SELECT 
//                     sa.question_id,
//                     q.question_text,
//                     sa.selected_choice_id,
//                     c.choice_text AS selected_choice,
//                     sa.answer_text,
//                     sa.marks_awarded
//                  FROM student_answers sa
//                  JOIN questions q ON sa.question_id = q.id
//                  LEFT JOIN choices c ON sa.selected_choice_id = c.id
//                  WHERE sa.attempt_id = ?`,
//                 [attempt.id],
//                 (err2, answers) => {
//                     if (err2) return res.status(500).send(err2);

//                     res.json({
//                         student_id: studentId,
//                         quiz_id: quizId,
//                         score: attempt.score,
//                         started_at: attempt.started_at,
//                         completed_at: attempt.completed_at,
//                         answers: answers.map(a => ({
//                             question_id: a.question_id,
//                             question_text: a.question_text,
//                             selected_choice: a.selected_choice,
//                             answer_text: a.answer_text,
//                             marks_awarded: a.marks_awarded
//                         }))
//                     });
//                 }
//             );
//         }
//     );
// });


// //Get Student Quiz with Percentage and Grade
// app.get('/quizzes/:quizId/student/:studentId/report', (req, res) => {
//     const { quizId, studentId } = req.params;

//     // 1. Get the student's attempt
//     db.query(
//         `SELECT * FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?`,
//         [quizId, studentId],
//         (err, attempts) => {
//             if (err) return res.status(500).send(err);
//             if (attempts.length === 0) return res.status(404).json({ message: 'Student has not taken this quiz' });

//             const attempt = attempts[0];

//             // 2. Get the student's answers
//             db.query(
//                 `SELECT 
//                     sa.question_id,
//                     q.question_text,
//                     sa.selected_choice_id,
//                     c.choice_text AS selected_choice,
//                     sa.answer_text,
//                     sa.marks_awarded,
//                     q.marks AS max_marks
//                  FROM student_answers sa
//                  JOIN questions q ON sa.question_id = q.id
//                  LEFT JOIN choices c ON sa.selected_choice_id = c.id
//                  WHERE sa.attempt_id = ?`,
//                 [attempt.id],
//                 (err2, answers) => {
//                     if (err2) return res.status(500).send(err2);

//                     // 3. Calculate total possible marks
//                     const totalPossibleMarks = answers.reduce((sum, q) => sum + (q.max_marks || 0), 0);
//                     const totalScore = attempt.score;

//                     // 4. Calculate percentage
//                     const percentage = totalPossibleMarks ? ((totalScore / totalPossibleMarks) * 100).toFixed(2) : 0;

//                     // 5. Assign grade
//                     let grade;
//                     if (percentage >= 90) grade = 'A';
//                     else if (percentage >= 80) grade = 'B';
//                     else if (percentage >= 70) grade = 'C';
//                     else if (percentage >= 60) grade = 'D';
//                     else grade = 'F';

//                     res.json({
//                         student_id: studentId,
//                         quiz_id: quizId,
//                         score: totalScore,
//                         total_possible_marks: totalPossibleMarks,
//                         percentage: percentage + '%',
//                         grade,
//                         started_at: attempt.started_at,
//                         completed_at: attempt.completed_at,
//                         answers: answers.map(a => ({
//                             question_id: a.question_id,
//                             question_text: a.question_text,
//                             selected_choice: a.selected_choice,
//                             answer_text: a.answer_text,
//                             marks_awarded: a.marks_awarded,
//                             max_marks: a.max_marks
//                         }))
//                     });
//                 }
//             );
//         }
//     );
// });




app.post('/api/user-type', (req, res) => {
    const { type_name, description } = req.body;

    if (!type_name) {
        return res.status(400).json({ error: 'type_name is required' });
    }

    const sql = 'INSERT INTO user_type (type_name, description) VALUES (?, ?)';
    db.query(sql, [type_name, description || null], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(201).json({ message: 'User type created', user_type_id: result.insertId });
    });
});

// {
//     "type_name": "Admin",
//     "description": "Has full access to the system"
// }


app.post('/api/department', (req, res) => {
    const { department_name} = req.body;

    if (!department_name) {
        return res.status(400).json({ error: 'department_name is required' });
    }
    const sql = 'INSERT INTO department (department_name) VALUES (?)';
    db.query(sql, [department_name|| null], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(201).json({ message: 'Department created', department_id: result.insertId });
    });
});

// {
//     "department_name": "International Business Administration",
//     "description": "Department handling business management courses"
// }



app.post('/api/level', (req, res) => {
    const { level_name, description } = req.body;

    if (!level_name) {
        return res.status(400).json({ error: 'level_name is required' });
    }

    const sql = 'INSERT INTO Level (level_name, description) VALUES (?, ?)';
    db.query(sql, [level_name, description || null], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(201).json({ message: 'Level created', level_id: result.insertId });
    });
});

// {
//     "level_name": "200",
//     "description": "Second year courses"
// }

// API to get all levels
app.get('/levels', (req, res) => {
    const sql = 'SELECT * FROM level';
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(200).json({levels:results});
    });
});


// GET all departments
app.get('/departments', (req, res) => {
    const sql = 'SELECT * FROM `department` INNER JOIN level l on department_id=l.deptid';
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(200).json({results });
    });
});

// GET /departments
app.get('/department', (req, res) => {
  const sql = "SELECT department_id, department_name, created_at FROM department";
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database query failed' });
    }
    res.json(results);
  });
});

// GET API to fetch semesters
app.get('/semesters', (req, res) => {
  const query = `
    SELECT 
      semester_id, 
      semester_name, 
      academic_year, 
      start_date, 
      end_date, 
      status, 
      created_at, 
      updated_at 
    FROM semester
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching semesters:', err);
      return res.status(500).json({ error: 'Database query error' });
    }
    res.json(results);
  });
});


// GET API to fetch instructors
app.get('/instructors', (req, res) => {
  const query = `
    SELECT 
      instructor_id,
      first_name,
      last_name,
      email,
      phone,
      hire_date,
      department_id,
      specialization,
      status,
      created_at,
      updated_at
    FROM instructor
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching instructors:', err);
      return res.status(500).json({ error: 'Database query error' });
    }
    res.json(results);
  });
});


// GET API to fetch courses
app.get('/api/courses', (req, res) => {
  const query = `
    SELECT 
      course_id,
      course_name,
      description,
      credit_hours,
      level_id,
      department_id,
      created_at,
      updated_at
    FROM course
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching courses:', err);
      return res.status(500).json({ error: 'Database query error' });
    }
    res.json(results);
  });
});

// GET API to fetch days
app.get('/api/days', (req, res) => {
  const query = `
    SELECT 
      day_id, 
      day_name
    FROM days
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching days:', err);
      return res.status(500).json({ error: 'Database query error' });
    }
    res.json(results);
  });
});


app.get('/timetable-types', (req, res) => {
  const query = 'SELECT * FROM timetable_type';
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

// POST endpoint to insert a new timetable row
app.post('/createtimetable', (req,res) => {
  const {
    course_id,
    instructor_id,
    day_id,
    room,
    start_time,
    end_time,
    semester,
    academic_year,
    level_id,
    deptid,
    typeid,
    timerange
  } = req.body;

  const sql = `
    INSERT INTO atimetable
    (course_id, instructor_id, day_id, room, start_time, end_time, semester, academic_year,level_id,deptid,typeid,timerange)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?,?,?,?,?) `;

  const values=[
    course_id,
    instructor_id,
    day_id,
    room,
    start_time,
    end_time,
    semester,
    academic_year,
    level_id,
    deptid,
    typeid,
    `${start_time}-${end_time}`
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('Error inserting timetable:', err);
      return res.status(500).json({ error:'Database error' });
    }
    res.status(200).json({ message:'Timetable created successfully'});
  });
});


//get all user types
app.get('/user-types', (req, res) => {
    const sql = 'SELECT * FROM user_type';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(200).json({ userTypes: results });
    });
});

// 🔹 GET one department by ID
app.get('/api/department/:id', (req, res) => {
  const level_id = req.params.id;

  // use ? placeholder to avoid SQL injection
  const sql = 'SELECT * FROM `department` INNER JOIN level l on department_id=l.deptid where level_id = ?';

  db.query(sql, [level_id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Department not found' });
    }

    // return first row
    res.json(results[0]);
  });
});


// Route to get timetable
app.get('/timetables', async (req, res) => {
    try {
        const query = `
            SELECT 
                t.timerange,
                lvl.description as level,
                dept.department_name,
                sem.semester_name,

                MAX(CASE WHEN d.day_name = 'Monday' 
                    THEN COALESCE(
                        CONCAT(
                          c.course_name, 
                          ' (', t.room, ' – ', i.first_name, ' ', i.last_name, ')'
                        ),
                        tt.type_name
                    ) END) AS Monday,

                MAX(CASE WHEN d.day_name = 'Tuesday' 
                    THEN COALESCE(
                        CONCAT(
                          c.course_name, 
                          ' (', t.room, ' – ', i.first_name, ' ', i.last_name, ')'
                        ),
                        tt.type_name
                    ) END) AS Tuesday,

                MAX(CASE WHEN d.day_name = 'Wednesday' 
                    THEN COALESCE(
                        CONCAT(
                          c.course_name, 
                          ' (', t.room, ' – ', i.first_name, ' ', i.last_name, ')'
                        ),
                        tt.type_name
                    ) END) AS Wednesday,

                MAX(CASE WHEN d.day_name = 'Thursday' 
                    THEN COALESCE(
                        CONCAT(
                          c.course_name, 
                          ' (', t.room, ' – ', i.first_name, ' ', i.last_name, ')'
                        ),
                        tt.type_name
                    ) END) AS Thursday,

                MAX(CASE WHEN d.day_name = 'Friday' 
                    THEN COALESCE(
                        CONCAT(
                          c.course_name, 
                          ' (', t.room, ' – ', i.first_name, ' ', i.last_name, ')'
                        ),
                        tt.type_name
                    ) END) AS Friday,

                MAX(CASE WHEN d.day_name = 'Saturday' 
                    THEN COALESCE(
                        CONCAT(
                          c.course_name, 
                          ' (', t.room, ' – ', i.first_name, ' ', i.last_name, ')'
                        ),
                        tt.type_name
                    ) END) AS Saturday,

                MAX(CASE WHEN d.day_name = 'Sunday' 
                    THEN COALESCE(
                        CONCAT(
                          c.course_name, 
                          ' (', t.room, ' – ', i.first_name, ' ', i.last_name, ')'
                        ),
                        tt.type_name
                    ) END) AS Sunday

            FROM atimetable t
            JOIN days d 
                ON t.day_id = d.day_id
            LEFT JOIN course c 
                ON t.course_id = c.course_id
            LEFT JOIN instructor i 
                ON t.instructor_id = i.instructor_id
            LEFT JOIN level lvl
                ON t.level_id = lvl.level_id
            LEFT JOIN department dept
                ON t.deptid = dept.department_id
            LEFT JOIN semester sem
                ON t.semester = sem.semester_id
            LEFT JOIN timetable_type tt
                ON t.typeid = tt.id
            GROUP BY t.timerange, lvl.description, dept.department_name, sem.semester_name
            ORDER BY t.timerange, lvl.description, dept.department_name, sem.semester_name;
        `;

        // Execute query
        const [rows] = await pool.query(query); // rows is an array
        res.json(rows);
    } catch (error) {
        console.error('Error fetching timetable:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// POST /timetables with filters
app.post('/timetableSearch', async (req, res) => {
    try {
        // Destructure filters from request body
        const { department_id, level_id, day_name, semester_id } = req.body;

        // Build dynamic WHERE conditions
        let conditions = [];
        let params = [];

        if (department_id) {
            conditions.push('t.deptid = ?');
            params.push(department_id);
        }
        if (level_id) {
            conditions.push('t.level_id = ?');
            params.push(level_id);
        }
        if (day_name) {
            conditions.push('d.day_name = ?');
            params.push(day_name);
        }
        if (semester_id) {
            conditions.push('t.semester = ?');
            params.push(semester_id);
        }

        // Combine into WHERE clause
        const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        const query = `
            SELECT 
                t.timerange,
                lvl.description as level,
                dept.department_name,
                sem.semester_name,

                MAX(CASE WHEN d.day_name = 'Monday' 
                    THEN COALESCE(
                        CONCAT(
                          c.course_name, 
                          ' (', t.room, ' – ', i.first_name, ' ', i.last_name, ')'
                        ),
                        tt.type_name
                    ) END) AS Monday,

                MAX(CASE WHEN d.day_name = 'Tuesday' 
                    THEN COALESCE(
                        CONCAT(
                          c.course_name, 
                          ' (', t.room, ' – ', i.first_name, ' ', i.last_name, ')'
                        ),
                        tt.type_name
                    ) END) AS Tuesday,

                MAX(CASE WHEN d.day_name = 'Wednesday' 
                    THEN COALESCE(
                        CONCAT(
                          c.course_name, 
                          ' (', t.room, ' – ', i.first_name, ' ', i.last_name, ')'
                        ),
                        tt.type_name
                    ) END) AS Wednesday,

                MAX(CASE WHEN d.day_name = 'Thursday' 
                    THEN COALESCE(
                        CONCAT(
                          c.course_name, 
                          ' (', t.room, ' – ', i.first_name, ' ', i.last_name, ')'
                        ),
                        tt.type_name
                    ) END) AS Thursday,

                MAX(CASE WHEN d.day_name = 'Friday' 
                    THEN COALESCE(
                        CONCAT(
                          c.course_name, 
                          ' (', t.room, ' – ', i.first_name, ' ', i.last_name, ')'
                        ),
                        tt.type_name
                    ) END) AS Friday,

                MAX(CASE WHEN d.day_name = 'Saturday' 
                    THEN COALESCE(
                        CONCAT(
                          c.course_name, 
                          ' (', t.room, ' – ', i.first_name, ' ', i.last_name, ')'
                        ),
                        tt.type_name
                    ) END) AS Saturday,

                MAX(CASE WHEN d.day_name = 'Sunday' 
                    THEN COALESCE(
                        CONCAT(
                          c.course_name, 
                          ' (', t.room, ' – ', i.first_name, ' ', i.last_name, ')'
                        ),
                        tt.type_name
                    ) END) AS Sunday

            FROM atimetable t
            JOIN days d 
                ON t.day_id = d.day_id
            LEFT JOIN course c 
                ON t.course_id = c.course_id
            LEFT JOIN instructor i 
                ON t.instructor_id = i.instructor_id
            LEFT JOIN level lvl
                ON t.level_id = lvl.level_id
            LEFT JOIN department dept
                ON t.deptid = dept.department_id
            LEFT JOIN semester sem
                ON t.semester = sem.semester_id
            LEFT JOIN timetable_type tt
                ON t.typeid = tt.id
            ${whereClause}
            GROUP BY t.timerange, lvl.description, dept.department_name, sem.semester_name
            ORDER BY t.timerange, lvl.description, dept.department_name, sem.semester_name;
        `;

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching timetable:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /quizzes - Create a new quiz
 app.post('/preparequizze', async (req, res) => {
  try {
    const {
      quiz_title,
      quiz_description,
      department_id,
      level_id,
      course_id,
      prepared_by,
      total_marks,
      duration,
      at,
      deadline
    } = req.body;

    // Basic validation
    if (!quiz_title || !prepared_by) {
      return res.status(400).json({ message: 'quiz_title and prepared_by are required.' });
    }

    // SQL Insert
    const sql = `
      INSERT INTO quizzes
      (quiz_title, quiz_description, department_id, level_id, course_id, prepared_by, total_marks,duration,at,deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?,?,?,?)`;

    const values = [
      quiz_title,
      quiz_description,
      department_id,
      level_id,
      course_id,
      prepared_by,
      total_marks,
      duration,
      at,
      deadline
    ];

     //Execute the query (use your pool or db connection)
     const [result] = await pool.query(sql,values);
     res.status(201).json({
      message:'Quiz created successfully',
      quiz_id:result.insertId // use insertId from result
    });
  }catch(err){
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err });
  }
});



// POST /api/quiz-questions
 app.post('/quiz-questions', async (req,res) => {
  try {
    const { quiz_id, question_text, marks } = req.body;

    // Basic validation
    if (!quiz_id || !question_text || marks === undefined) {
      return res.status(400).json({ message: 'quiz_id, question_text, and marks are required.' });
    }

    // SQL Insert
    const sql = `
      INSERT INTO quiz_questions (quiz_id, question_text, marks)
      VALUES (?, ?, ?)
    `;
    const values = [quiz_id, question_text, marks];
    const [result] = await pool.query(sql, values);
    res.status(201).json({
        message:'Question created successfully',
        question_id:result.insertId
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err });
  }
});





   //GET /api/quizzes?prepared_by=24
    app.get('/quizzes', async (req,res) => {
    try {
    const quiz_id = parseInt(req.query.quiz_id);
    if(!quiz_id) {
      return res.status(400).json({ message:'prepared_by query parameter is required and must be a number.' });
    }

    const sql = `
      SELECT quiz_id, quiz_title 
      FROM quizzes 
      WHERE quiz_id = ?`;
    const [rows] = await pool.query(sql, [quiz_id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err });
  }
});


// POST /api/question-options
   app.post('/question-options', async (req, res) =>{
      try{

     const {question_id,option_text, is_correct}=req.body 
     // Validation
     if(!question_id || !option_text) {
        return res.status(400).json({message:'question_id and option_text are required.'});
      }

    // Convert boolean to 0/1 if needed
    const correctValue = is_correct ? 1 : 0;

    // SQL Insert
    const sql = `
      INSERT INTO question_options(question_id,option_text,is_correct)
      VALUES (?,?,?) `;
    const values = [question_id, option_text,correctValue];
    const [result] = await pool.query(sql,values);

    res.status(201).json({
      message:'Question option created successfully',
      option_id:result.insertId
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err });
  }
});



// GET /api/quiz-questions/:id
app.get('/quiz-questions/:id', async (req, res) => {
  try {
    const questionId = parseInt(req.params.id);

    if (!questionId) {
      return res.status(400).json({ message: 'Valid question_id is required.' });
    }

    const sql = `
      SELECT question_id, question_text
      FROM quiz_questions
      WHERE question_id = ?
    `;

    const [rows] = await pool.query(sql, [questionId]);

    if ((rows).length === 0) {
      return res.status(404).json({ message: 'Question not found.' });
    }

    res.json(rows[0]); // return single row
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err });
  }
});



app.get('/api/quiz-questions', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        qq.question_id,
        qq.quiz_id,
        qq.question_text,
        op.option_id,
        op.option_text,
        op.is_correct
      FROM quiz_questions qq
      INNER JOIN question_options op 
        ON qq.question_id = op.question_id
      ORDER BY qq.question_id, op.option_id
    `);

    // Group by question_id
    const result = {};
    rows.forEach(row =>{
      if (!result[row.question_id]) {
        result[row.question_id] = {
          question_id: row.question_id,
          quiz_id: row.quiz_id,
          question_text: row.question_text,
          options: []
        };
      }
      result[row.question_id].options.push({
        option_id: row.option_id,
        option_text: row.option_text,
        is_correct: row.is_correct
      });
    });

    res.json(Object.values(result));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});



// --- API route to list quizzes + questions + options filtered by department_id & level_id ---
// app.get('/api/quizzes/:department_id/:level_id', async (req, res) => {
//   const { department_id, level_id } = req.params;

//   try {
//     const [rows] = await pool.query(
//       `
//       SELECT 
//         q.quiz_title,
//         q.quiz_description,
//         q.total_marks,
//         qq.question_id,
//         qq.marks,
//         qq.quiz_id,
//         qq.question_text,
//         op.option_id,
//         op.option_text,
//         op.is_correct
//       FROM quiz_questions qq
//       INNER JOIN question_options op 
//         ON qq.question_id = op.question_id
//       INNER JOIN quizzes q 
//         ON qq.quiz_id = q.quiz_id
//       WHERE q.department_id = ? AND q.level_id = ?
//       ORDER BY qq.question_id, op.option_id, q.created_at DESC
//       `,
//       [department_id, level_id]
//     );

//     // Group by quiz -> question -> options
//     const quizzesMap = {};
//     rows.forEach(row => {
//       const quizKey = row.quiz_id;
//       // --- ensure quiz exists ---
//       if (!quizzesMap[quizKey]) {
//         quizzesMap[quizKey] = {
//           quiz_id: row.quiz_id,
//           quiz_title: row.quiz_title,
//           quiz_description: row.quiz_description,
//           total_marks:row.total_marks,
//           questions: {}
//         };
//       }

//       // --- ensure question exists inside this quiz ---
//       if (!quizzesMap[quizKey].questions[row.question_id]) {
//         quizzesMap[quizKey].questions[row.question_id] = {
//           question_id: row.question_id,
//           question_text: row.question_text,
//           marks:row.marks,
//           options: []
//         };
//       }

//       // --- push option ---
//       quizzesMap[quizKey].questions[row.question_id].options.push({
//         option_id: row.option_id,
//         option_text: row.option_text,
//         is_correct: row.is_correct
//       });
//     });

//     // Convert nested object to array
//     const quizzesArray = Object.values(quizzesMap).map(quiz => ({
//       quiz_id: quiz.quiz_id,
//       quiz_title: quiz.quiz_title,
//       quiz_description: quiz.quiz_description,
//       total_marks:quiz.total_marks,
//       questions: Object.values(quiz.questions)
//     }));

//     res.json(quizzesArray);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });


app.get('/api/quizzes/:department_id/:level_id', async (req, res) => {
  const { department_id, level_id } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        q.quiz_id,
        q.quiz_title,
        q.quiz_description,
        q.total_marks,
        q.deadline,
        qq.question_id,
        qq.marks,
        qq.question_text,
        op.option_id,
        op.option_text,
        op.is_correct
      FROM quiz_questions qq
      INNER JOIN question_options op 
        ON qq.question_id = op.question_id
      INNER JOIN quizzes q 
        ON qq.quiz_id = q.quiz_id
      WHERE q.department_id = ? AND q.level_id = ?
      ORDER BY q.quiz_id DESC
      `,
      [department_id, level_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'No quiz found' });
    }

    // Group question -> options
    const quiz = {
      quiz_id: rows[0].quiz_id,
      quiz_title: rows[0].quiz_title,
      quiz_description: rows[0].quiz_description,
      total_marks: rows[0].total_marks,
      deadline: rows[0].deadline,
      questions: []
    };

    const questionsMap = {};
    rows.forEach(row => {
      if (!questionsMap[row.question_id]) {
        questionsMap[row.question_id] = {
          question_id: row.question_id,
          question_text: row.question_text,
          marks: row.marks,
          options: []
        };
      }

      questionsMap[row.question_id].options.push({
        option_id: row.option_id,
        option_text: row.option_text,
        is_correct: row.is_correct
      });
    });

    quiz.questions = Object.values(questionsMap);

    res.json(quiz);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});



app.get('/api/quizzes/:quiz_id', async (req, res) => {
  const { quiz_id } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        q.quiz_id,
        q.quiz_title,
        q.quiz_description,
        q.total_marks,
        q.deadline,
        qq.question_id,
        qq.marks,
        qq.question_text,
        op.option_id,
        op.option_text,
        op.is_correct
      FROM quiz_questions qq
      INNER JOIN question_options op 
        ON qq.question_id = op.question_id
      INNER JOIN quizzes q 
        ON qq.quiz_id = q.quiz_id
      WHERE q.quiz_id = ?
      ORDER BY qq.question_id ASC
      `,
      [quiz_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    // ✅ Build quiz structure
    const quiz = {
      quiz_id: rows[0].quiz_id,
      quiz_title: rows[0].quiz_title,
      quiz_description: rows[0].quiz_description,
      total_marks: rows[0].total_marks,
      deadline: rows[0].deadline,
      questions: []
    };

    const questionsMap = {};
    rows.forEach(row => {
      if (!questionsMap[row.question_id]) {
        questionsMap[row.question_id] = {
          question_id: row.question_id,
          question_text: row.question_text,
          marks: row.marks,
          options: []
        };
      }

      questionsMap[row.question_id].options.push({
        option_id: row.option_id,
        option_text: row.option_text,
        is_correct: row.is_correct
      });
    });

    quiz.questions = Object.values(questionsMap);

    res.json(quiz);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get("/api/quiz/latest", (req, res) => {
  const { deptid, level_id } = req.query;

  // Validate params
  if (!deptid || !level_id) {
    return res.status(400).json({ error: "deptid and level_id are required" });
  }

  const sql = `
    SELECT q.quiz_id,q.deadline,q.at
    FROM quizzes q
    WHERE q.department_id = ? AND q.level_id = ?
    ORDER BY q.quiz_id DESC
    LIMIT 1
  `;

  db.query(sql, [deptid, level_id], (err, result) => {
    if(err){
      console.error("Error fetching quiz:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (result.length === 0){
      return res.status(404).json({message: "No quiz found for this department and level" });
    }
    res.json(result[0]);
  });
});



// Endpoint to filter students
app.get('/students', (req, res) => {
  const { department, studentnumber, level } = req.query;

  // Base SQL
  let sql = `
    SELECT 
      A.FULLNAME,
      D.department_name,
      L.description AS level_description,
      A.STUDENTNUMBER,
      A.TEL,
      A.EMAIL
    FROM account A
    INNER JOIN DEPARTMENT D ON A.DEPARTMENT = D.department_id
    INNER JOIN level L ON A.CLASSES = L.level_id
    WHERE 1=1`;

  const params = [];
  // Add filters dynamically if provided
  if (department) {
    sql += ' AND D.department_id = ?';
    params.push(department);
  }
  if (studentnumber) {
    sql += ' AND A.STUDENTNUMBER = ?';
    params.push(studentnumber);
  }
 
  if (level) {
    sql += ' AND L.level_id = ?';
    params.push(level);
  }
  db.query(sql, params, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Server Error');
    }
    res.json(results);
  });
});



//quiz dealine
app.get('/api/quiz/:quiz_id/deadline', async (req, res) => {
  const { quiz_id } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT quiz_id, quiz_title, quiz_description, department_id, level_id, course_id,
              prepared_by, created_at, duration, deadline, total_marks
       FROM quizzes
       WHERE quiz_id = ?`,
      [quiz_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const quiz = rows[0];

    // Compare deadline with current time
    const now = new Date();
    const deadline = new Date(quiz.deadline); // assuming deadline is DATETIME in DB
    const isDeadlineOver = deadline.getTime() < now.getTime();

    res.json({
      quiz_id: quiz.quiz_id,
      quiz_title: quiz.quiz_title,
      quiz_description: quiz.quiz_description,
      total_marks: quiz.total_marks,
      deadline: quiz.deadline,
      isDeadlineOver // true if deadline passed
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});


// const [rows] = await pool.query('SELECT deadline FROM quizzes WHERE quiz_id=?', [quizId]);
// const deadline = new Date(rows[0].deadline);
// if (deadline < new Date()) {
//   return res.status(403).json({ error: 'Quiz deadline has passed. Cannot submit.' });
// }


app.post('/api/student-answers', async (req, res) => {
  const answers = req.body; // array of {student_id, quiz_id, question_id, option_id}

  if (answers.length === 0) {
    return res.status(400).json({ error: 'No answers submitted' });
  }

  const studentId = answers[0].student_id;
  const quizId = answers[0].quiz_id;

  try {
    // Check if already exists
    const [existing] = await pool.query(
      'SELECT 1 FROM student_answer WHERE student_id = ? AND quiz_id = ? LIMIT 1',
      [studentId, quizId]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: 'You already took this quiz. Cannot perform it twice.' });
    }

    // Insert answers
    const values = answers.map(a => [
      a.student_id,
      a.question_id,
      a.option_id ?? null,
      a.quiz_id
    ]);

    await pool.query(
      'INSERT INTO student_answer (student_id,question_id,option_id,quiz_id) VALUES ?',
      [values]
    );

    res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// working performing quiz
// app.post('/api/student-answers', async (req, res) => {
//   const answers = req.body; // array of {student_id, quiz_id, question_id, option_id}

//   try {
//     // Insert all at once (bulk insert)
//     const values = answers.map(a =>[a.student_id,a.question_id,a.option_id,a.quiz_id]);
//          await pool.query(
//          'INSERT INTO student_answer (student_id,question_id,option_id,quiz_id) VALUES ?',
//          [values]
//       );

//     res.json({status: 'ok' });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });





// Assuming Express and a MySQL pool
app.get('/api/student-result/:studentId/:quizId', async (req, res) => {
  const { studentId, quizId } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT 
         sa.student_id,
         qq.quiz_id,
         SUM(
           CASE WHEN op.is_correct = 1 THEN qq.marks ELSE 0 END
         ) AS total_marks_obtained,
         SUM(qq.marks) AS total_possible_marks
       FROM student_answer sa
       INNER JOIN question_options op 
         ON sa.option_id = op.option_id
       INNER JOIN quiz_questions qq 
         ON sa.question_id = qq.question_id
       WHERE sa.student_id = ? AND qq.quiz_id = ?
       GROUP BY sa.student_id, qq.quiz_id`,
      [studentId,quizId]
    );

    if (rows.length===0){
       return res.status(404).json({message:'No answers found for this student/quiz'});
    }
    const result = rows[0];
    const percentage =
      (result.total_marks_obtained / result.total_possible_marks) * 100;
    // Define pass mark threshold (example 50%)
    const passThreshold = 50;
    const status = percentage >= passThreshold ? 'Pass' : 'Fail';
     res.json({
      student_id:result.student_id,
      quiz_id:result.quiz_id,
      total_marks_obtained:result.total_marks_obtained,
      total_possible_marks:result.total_possible_marks,
      percentage:percentage.toFixed(2),
      status,
     });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/quiz/:id/duration', async (req, res) => {
  try {
    const quizId = req.params.id; // e.g. /api/quiz/2/duration

    // ✅ Use await with pool.query
    const [rows] = await pool.query(
      'SELECT duration FROM quizzes WHERE quiz_id = ?',
      [quizId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    res.json({ duration: rows[0].duration });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


app.get('/api/student-results', async (req, res) => {
  const { department, studentId, studentnumber, course, level } = req.query;

  try {
    let sql = `
      SELECT 
        A.STUDENTNUMBER,
        A.FULLNAME AS student_name,
        A.TEL AS student_tel,
        D.department_name AS department,
        C.description AS course,
        QQ.quiz_id,
        Q.level_id AS level_of_study,
        SUM(CASE WHEN O.is_correct = 1 THEN QQ.marks ELSE 0 END) AS total_marks_obtained,
        SUM(QQ.marks) AS total_possible_marks
      FROM student_answer SA
      INNER JOIN question_options O ON SA.option_id = O.option_id
      INNER JOIN quiz_questions QQ ON SA.question_id = QQ.question_id
      INNER JOIN account A ON SA.student_id = A.ID
      INNER JOIN department D ON A.DEPARTMENT = D.department_id
      INNER JOIN quizzes Q ON QQ.quiz_id = Q.quiz_id
      INNER JOIN course C ON Q.course_id = C.course_id
      INNER JOIN level L ON Q.level_id = L.level_id
      WHERE 1=1
    `;

    const params = [];

    if (department) {
      sql += ' AND D.department_id = ?';
      params.push(department);
    }

    // ✅ Accept both studentId and studentnumber
    const studentNum = studentId || studentnumber;
    if (studentNum && studentNum.trim() !== '') {
      sql += ' AND A.STUDENTNUMBER = ?';
      params.push(studentNum.trim());
    }

    if (course) {
      sql += ' AND C.course_id = ?';
      params.push(course);
    }

    if (level) {
      sql += ' AND L.level_id = ?';
      params.push(level);
    }

    sql += `
      GROUP BY 
        A.STUDENTNUMBER, 
        A.FULLNAME, 
        A.TEL, 
        D.department_name, 
        C.description, 
        QQ.quiz_id,
        Q.level_id `;

    const [rows] = await pool.query(sql, params);
    const passThreshold = 50;
    const results = rows.map(r => {
      const percentage =
        r.total_possible_marks > 0
          ? (r.total_marks_obtained / r.total_possible_marks) * 100
          : 0;
      const status = percentage >= passThreshold ? 'Pass' : 'Fail';
      return {
        ...r,
        percentage: percentage.toFixed(2),
        status
      };
    });
    res.json(results);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/student/performance/:studentNumber', async (req, res) => {
  const { studentNumber } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
          A.STUDENTNUMBER,
          A.FULLNAME AS student_name,
          A.TEL AS student_tel,
          D.department_name AS department,
          C.description AS course,
          L.level_id AS level_of_study,
          SUM(QQ.marks) AS max_marks,
          SUM(CASE WHEN O.is_correct = 1 THEN QQ.marks ELSE 0 END) AS obtained_marks,
          ROUND(
              (SUM(CASE WHEN O.is_correct = 1 THEN QQ.marks ELSE 0 END) * 100.0)
              / NULLIF(SUM(QQ.marks), 0), 2
          ) AS overall_percentage,
          CASE 
              WHEN (SUM(CASE WHEN O.is_correct = 1 THEN QQ.marks ELSE 0 END) * 100.0)
                   / NULLIF(SUM(QQ.marks), 0) >= 90 THEN 'A'
              WHEN (SUM(CASE WHEN O.is_correct = 1 THEN QQ.marks ELSE 0 END) * 100.0)
                   / NULLIF(SUM(QQ.marks), 0) >= 80 THEN 'B'
              WHEN (SUM(CASE WHEN O.is_correct = 1 THEN QQ.marks ELSE 0 END) * 100.0)
                   / NULLIF(SUM(QQ.marks), 0) >= 70 THEN 'C'
              WHEN (SUM(CASE WHEN O.is_correct = 1 THEN QQ.marks ELSE 0 END) * 100.0)
                   / NULLIF(SUM(QQ.marks), 0) >= 60 THEN 'D'
              WHEN (SUM(CASE WHEN O.is_correct = 1 THEN QQ.marks ELSE 0 END) * 100.0)
                   / NULLIF(SUM(QQ.marks), 0) >= 50 THEN 'E'
              ELSE 'F'
          END AS overall_grade
      FROM student_answer SA
      INNER JOIN question_options O ON SA.option_id = O.option_id
      INNER JOIN quiz_questions QQ ON SA.question_id = QQ.question_id
      INNER JOIN account A ON SA.student_id = A.ID
      INNER JOIN department D ON A.DEPARTMENT = D.department_id
      INNER JOIN quizzes Q ON QQ.quiz_id = Q.quiz_id
      INNER JOIN course C ON Q.course_id = C.course_id
      INNER JOIN level L ON Q.level_id = L.level_id
      WHERE A.STUDENTNUMBER = ?
      GROUP BY 
          A.STUDENTNUMBER, A.FULLNAME, A.TEL, D.department_name, C.description, L.level_id
      ORDER BY C.description;
      `,
      [studentNumber]
    );

    // ✅ If no records, just return an empty array
    if (rows.length === 0) {
      return res.json([]);
    }

    // ✅ Calculate totals and averages
    const grandTotalMarks = rows.reduce((sum, row) => sum + Number(row.max_marks || 0), 0);
    const totalObtainedMarks = rows.reduce((sum, row) => sum + Number(row.obtained_marks || 0), 0);
    const overallAverage =
      rows.length > 0
        ? parseFloat(
            (
              rows.reduce((sum, row) => sum + Number(row.overall_percentage || 0), 0) /
              rows.length
            ).toFixed(2)
          )
        : 0;

    // ✅ Determine overall grade
    let overallGrade = 'F';
    if (overallAverage >= 90) overallGrade = 'A';
    else if (overallAverage >= 80) overallGrade = 'B';
    else if (overallAverage >= 70) overallGrade = 'C';
    else if (overallAverage >= 60) overallGrade = 'D';
    else if (overallAverage >= 50) overallGrade = 'E';

    const gradeRemarks = {
      A: 'Excellent',
      B: 'Very Good',
      C: 'Good',
      D: 'Fair',
      E: 'Pass',
      F: 'Fail'
    };

    // ✅ Build final response
    const studentData = {
      STUDENTNUMBER: rows[0].STUDENTNUMBER,
      student_name: rows[0].student_name,
      student_tel: rows[0].student_tel,
      department: rows[0].department,
      level_of_study: rows[0].level_of_study,
      subjects: rows.map(row => ({
        course: row.course,
        max_marks: Number(row.max_marks),
        obtained_marks: Number(row.obtained_marks),
        overall_percentage: Number(row.overall_percentage),
        overall_grade: row.overall_grade,
        remark: gradeRemarks[row.overall_grade] || 'N/A'
      })),
      grand_total_marks: grandTotalMarks,
      total_obtained_marks: totalObtainedMarks,
      overall_average: overallAverage,
      overall_grade: overallGrade,
      overall_remark: gradeRemarks[overallGrade] || 'N/A'
    };

    res.json(studentData);
  } catch (err) {
    console.error('❌ Error fetching student performance:', err);
    res.status(500).json({ error: 'Database error' });
  }
});









app.put('/api/uquiz/:id/duration', (req, res) => {
  const quizId = parseInt(req.params.id, 10);

  if (isNaN(quizId)) {
    return res.status(400).json({ error: 'Invalid quiz ID' });
  }

  const sql = 'UPDATE quizzes SET duration = 0 WHERE quiz_id = ?';
  db.query(sql, [quizId], (err, result) => {
    if (err) {
      console.error('Error updating quiz duration:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    res.json({ message: 'Quiz duration updated to 0 successfully' });
  });
});

app.post('/api/createfolder',async (req,res) => {
  try {
    const {name,department,course,level}=req.body;
    if (!name || !department || !course || !level) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    const id = Date.now(); // JS timestamp as unique folder ID
    const sql = `
      INSERT INTO folders (id, name,department, course, level)
      VALUES (?, ?, ?, ?, ?)`;
    await pool.execute(sql, [id, name, department, course, level]);
    res.status(201).json({ message:'Folder created successfully',folderId: id});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err });
  }
});


// GET all folders
app.get('/api/getfolders', async (req,res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, name, department, course, level, created_at AS createdAt
      FROM folders
      ORDER BY created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err });
  }
});



  app.get('/api/folders/:department/:level',async (req, res) =>{

   try{
    const { department, level } = req.params;
    // Validate parameters
    if(!department || !level) {
      return res.status(400).json({ error: 'Department and level are required' });
    }

    const [rows] = await pool.query(`
      SELECT id, name, department, course, level, created_at AS createdAt
      FROM folders
      WHERE department = ? AND level = ?
      ORDER BY created_at DESC
    `, [department, level]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err });
  }
});


  app.get('/api/foldert/:department',async (req, res) =>{

   try{
    const { department} = req.params;
    // Validate parameters
    if(!department) {
      return res.status(400).json({ error: 'Department is required' });
    }

    const [rows] = await pool.query(`
      SELECT id, name, department, course, level, created_at AS createdAt
      FROM folders
      WHERE department = ? 
      ORDER BY created_at DESC
    `,[department]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err });
  }
});

// POST new course for a folder
app.post('/api/createfoldercourse', async (req,res) => {
  try {
    const { folder_id, filename } = req.body;

    if (!folder_id || !filename) {
      return res.status(400).json({ message: 'folder_id and filename are required' });
    }

    const sql = `INSERT INTO folder_courses (folder_id, filename) VALUES (?, ?)`;
    const [result] = await pool.execute(sql, [folder_id, filename]);

    res.status(201).json({
      message: 'Course added successfully',
      folder_id,
      filename,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err });
  }
});

app.get('/api/folder-courses', async (req, res) => {
  try {
    const sql = `SELECT id, folder_id, filename FROM folder_courses ORDER BY id ASC`;
    const [rows] = await pool.execute(sql);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err });
  }
});

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads/'); // make sure folder exists
//   },
//   filename: (req, file, cb) => {
//     // unique filename
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     cb(null, uniqueSuffix + path.extname(file.originalname));
//   },
// });

app.post('/api/upload-course', upload.single('file'), async (req, res) => {
  try {
    const {folderId}=req.body;
    const file = req.file;
    if(!folderId || !file){
      return res.status(400).json({ error:'folderId and file are required'});
    }
    // Save to DB
    const sql = 'INSERT INTO folder_courses (folder_id, filename) VALUES (?, ?)';
    await pool.query(sql, [folderId, file.filename]);
    res.json({
      message:'File uploaded successfully',
      file:{
        originalname:file.originalname,
        storedAs:file.filename,
        path:file.path,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE a folder by ID
app.delete('/api/folders/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete the folder
    const sql = 'DELETE FROM folders WHERE id = ?';
    const [result] = await pool.query(sql, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Because of ON DELETE CASCADE, folder_courses rows will be deleted automatically.
    res.json({ message: 'Folder deleted successfully' });
  } catch (err) {
    console.error('Error deleting folder:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/api/uploadcourse', upload.single('file'), async (req, res) => {
  try {
    const { folderId } = req.body;
    const file = req.file;

    if (!folderId || !file) {
      return res.status(400).json({ error: 'folderId and file are required' });
    }

    // Save to DB (store folder_id, filename, path, originalname, storedAs)
    const sql =
      'INSERT INTO folder_courses (folder_id, filename, path, originalname, storedAs) VALUES (?, ?, ?, ?, ?)';
    await pool.query(sql, [
      folderId,
      file.filename,   // filename stored on server
      file.path,       // full server path
      file.originalname, // original uploaded filename
      file.filename,   // storedAs (same as filename)
    ]);

    res.json({
      message: 'Course uploaded successfully',
      file: {
        originalname: file.originalname,
        storedAs: file.filename,
        path: file.path,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


// GET files by folder ID
app.get('/api/folder/:folderId/files', async (req, res) => {
  try {
    const { folderId } = req.params;

    // Query the database
    const sql = `
      SELECT 
        id,
        folder_id,
        originalname,
        storedAs,
        filename,
        path,
        created_at
      FROM folder_courses
      WHERE folder_id = ? 
      ORDER BY created_at DESC
    `;
    const [rows] = await pool.query(sql, [folderId]);

    res.json(rows);
  } catch (err) {
    console.error('Error fetching files:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


 app.get('/api/accounts/:level/:department', async (req, res) => {
  const {level, department } = req.params;
  const sql = `
    SELECT A.EMAIL FROM account A INNER JOIN level L ON A.CLASSES=L.level_id INNER JOIN department D ON A.DEPARTMENT=D.department_id
WHERE L.level_id=? AND D.department_name=?`;
    const [rows] = await pool.query(sql, [department, level]);
    res.json(rows);
});


app.get('/emails', async (req, res) => {
  const { level_id,department_name }=req.query;

  if (!level_id || !department_name) {
    return res.status(400).json({ error: 'Please provide level_id and department_name' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT A.EMAIL
       FROM account A
       INNER JOIN level L ON A.CLASSES = L.level_id
       INNER JOIN department D ON A.DEPARTMENT = D.department_id
       WHERE L.level_id = ? AND D.department_name = ?`,
      [level_id, department_name] // parameters from URL
    );

  
   // Convert array of objects → array of email strings
    const emails = rows.map(row => row.EMAIL);

    res.json(emails); // flat array
   // res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.get("/department/total", async (req, res) => {
      try{
        const [rows] = await pool.query(
         `SELECT COUNT(department_id) AS total FROM department`
       );

    // rows will be an array like: [ { total: 123 } ]
    res.json(rows[0]); 
    }catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database query failed" });
    }
   });

   app.get("/course/total", async (req, res) => {
      try{
        const [rows] = await pool.query(
         `SELECT count(course_id) as total FROM course`
       );

    // rows will be an array like: [ { total: 123 } ]
    res.json(rows[0]); 
    }catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database query failed" });
    }
   });

      app.get("/account/total", async (req, res) => {
      try{
        const [rows] = await pool.query(
          `SELECT count(ID) AS total FROM account`
       );

    // rows will be an array like: [ { total: 123 } ]
    res.json(rows[0]); 
    }catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database query failed" });
    }
   });

 app.get("/departs/total", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        COUNT(a.ID) AS student, 
        d.department_name AS department
      FROM department d
      INNER JOIN account a 
        ON d.department_id = a.DEPARTMENT
      GROUP BY d.department_name
    `);

  // Force student → number
    const result = (rows ).map(r => ({
      student: Number(r.student),
      department: r.department,
    }));

    res.json(result);
  } catch (error) {
    console.error("Error fetching department students:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});



 app.get("/courses/total", async (req, res) => {
  try {
    const [rows] = await pool.query(`
 SELECT c.description AS name, SUM(CASE WHEN op.is_correct = 1 THEN qq.marks ELSE 0 END) AS value FROM student_answer sa INNER JOIN question_options op ON sa.option_id = op.option_id INNER JOIN quiz_questions qq ON sa.question_id = qq.question_id INNER JOIN account s ON sa.student_id = s.ID INNER JOIN DEPARTMENT d ON s.DEPARTMENT = d.department_id INNER JOIN quizzes qs ON qq.quiz_id = qs.quiz_id INNER JOIN course c ON qs.course_id = c.course_id JOIN level lv ON qs.level_id = lv.level_id GROUP by c.description
    `);

  // Force student → number
    const result = (rows ).map(r => ({
      name: r.name,
      value: Number(r.value),
      
    }));
    res.json(result);
  } catch (error) {
    console.error("Error fetching department students:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});


// ✅ GET /api/courses?department_id=1&level_id=2
app.get('/api/coursess', (req, res) => {
  const { department_id, level_id } = req.query;

  // Base SQL with JOINs
  let sql = `
    SELECT 
      course.course_id,
      course.course_name,
      course.description,
      course.credit_hours,
      level.description AS level_description,
      department.department_name,
      course.created_at,
      course.updated_at
    FROM course
    INNER JOIN department ON course.department_id = department.department_id
    INNER JOIN level ON course.level_id = level.level_id
    WHERE 1=1
  `;

  const params = [];

  // Add filters dynamically
  if (department_id) {
    sql += ' AND course.department_id = ?';
    params.push(department_id);
  }

  if (level_id) {
    sql += ' AND course.level_id = ?';
    params.push(level_id);
  }

  // Execute query
  db.query(sql, params, (err, results) => {
    if (err) {
      console.error('❌ Error executing query:', err);
      return res.status(500).json({ error: 'Database query failed' });
    }

    res.json(results);
  });
});

 app.get("/departresult/total", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.department_name AS department, SUM(CASE WHEN op.is_correct = 1 THEN qq.marks ELSE 0 END) AS marksobtained FROM student_answer sa INNER JOIN question_options op ON sa.option_id = op.option_id INNER JOIN quiz_questions qq ON sa.question_id = qq.question_id INNER JOIN account s ON sa.student_id = s.ID INNER JOIN DEPARTMENT d ON s.DEPARTMENT = d.department_id INNER JOIN quizzes qs ON qq.quiz_id = qs.quiz_id INNER JOIN course c ON qs.course_id = c.course_id JOIN level lv ON qs.level_id = lv.level_id group by d.department_name`
    );

  // Force student → number
    const result = (rows ).map(r => ({
      marksobtained: Number(r.marksobtained),
      department: r.department,
    }));

    res.json(rows);
  } catch (error) {
    console.error("Error fetching department students:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});


// ✅ GET quizzes prepared by a specific user
app.get("/api/quizzess/:prepared_by", (req, res) => {
  const { prepared_by } = req.params;
  const query = `
    SELECT 
      q.quiz_id,
      q.quiz_title,
      q.quiz_description,
      q.department_id,
      q.level_id,
      l.description,
      q.course_id,
      q.prepared_by,
      q.created_at,
      q.duration,
      c.course_name,
      q.deadline,
      q.total_marks,
      q.at,
      a.FULLNAME AS preparedby,
      a.STUDENTNUMBER AS Lectnumber,
      d.department_name
    FROM quizzes q
    INNER JOIN account a ON q.prepared_by = a.ID
    INNER JOIN department d ON q.department_id = d.department_id
    INNER JOIN course c ON q.course_id = c.course_id
    INNER JOIN level l ON q.level_id = l.level_id
    WHERE q.prepared_by = ?
    ORDER BY q.created_at DESC `;

   db.query(query, [prepared_by], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "No quizzes found for this lecturer." });
    }

    res.json(results);
  });
});

// DELETE QUIZ BY ID
app.delete('/api/delquizzes/:quiz_id', async (req, res) => {
  const { quiz_id } = req.params;
   try{
     const [result] = await pool.query(
      'DELETE FROM quizzes WHERE quiz_id = ?',
      [quiz_id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    res.status(200).json({ message: 'Quiz deleted successfully' });
   }catch(err){
    console.error('Error deleting quiz:', err);
    res.status(500).json({ error: 'Database error' });
  }
});




// Configure your SMTP transporter
// Create Nodemailer transporter using AWS SES SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure:false, // true for 465, false for 587
  auth: {
    user:process.env.SMTP_USER,
    pass:process.env.SMTP_PASS,
  },
  connectionTimeout: 10000 // 10 seconds
});


// Create Nodemailer transporter using AWS SES SMTP
// app.post("/api/sendemail", async (req, res) => {
//   const {to,subject,text} =req.body;
//   try {
//     const info = await transporter.sendMail({
//       from:process.env.FROM_EMAIL,
//        to:Array.isArray(to) ? to.join(','):to,
//       subject,
//       text:text //fallback to body if text is not provided
//        // also add HTML for Gmail rendering
//     });

    

//     console.log("Message sent:",info.messageId);
//     res.json({ message: "Email sent successfully", id: info.messageId });
//     }catch (error) {
//     console.error("Error sending email:", error);
//     res.status(500).json({ error: "Failed to send email" });
//    }
//   });

app.post("/api/sendemail", async (req, res) => {
  const { to, subject, text } = req.body;

  try {
    // Ensure we always have an array of recipients
    const recipients = Array.isArray(to) ? to : [to];

    // Filter out invalid emails
    const validEmails = recipients.filter(email => validator.isEmail(email.trim()));

    if (validEmails.length === 0) {
      return res.status(400).json({ error: "No valid email addresses provided" });
    }

    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: validEmails.join(","), // only valid emails
      subject,
      text: text || "No message body provided",
      html: `<p>${text || "No message body provided"}</p>` // optional HTML
    });

    // Log skipped invalid emails
    const skippedEmails = recipients.filter(email => !validator.isEmail(email.trim()));

    console.log("Message sent:", info.messageId);
    res.json({
      message: "Email sent successfully",
      id: info.messageId,
      sent_to: validEmails,
      skipped_invalid: skippedEmails
    });

  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Failed to send email", details: error.message });
  }
});


 // Insert message API
app.post("/insertmessage", (req, res) => {
  const { sender_id, sender_name, room, content } = req.body;

  // SQL insert - let MySQL auto-generate timestamp
  const sql = `INSERT INTO messages (sender_id, sender_name, room, content) VALUES (?, ?, ?, ?)`;
  db.query(sql, [sender_id, sender_name, room, content], (err, result) => {
    if (err) {
      console.error("Error inserting message:", err);
      return res.status(500).json({ error: "Database error" });
    }

    // ✅ Get current timestamp (or let MySQL's DEFAULT CURRENT_TIMESTAMP handle it)
    const now = new Date(); 

    // Build full message object
    const savedMessage = {
      id: result.insertId,
      sender_id,
      sender_name,
      room,
      content,
      time: now // send back a valid time
    };

    // Emit to socket.io room
    io.to(room).emit("chatMessage", savedMessage);

    res.json(savedMessage);
  });
});

// Get messages by room
app.get("/api/messages/:room", (req, res) => {
  const room = req.params.room;
  const sql = "SELECT * FROM messages WHERE room = ? ORDER BY time ASC";

  db.query(sql, [room], (err, rows) => {
    if (err) {
      console.error("Error fetching messages:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});



// Start server
// app.listen(PORT, () => {
//     console.log(`Server is running on http://localhost:${PORT}`);
// });

// Initialize Socket.IO
const io = new Server(server, {
  cors:{
    origin:'http://localhost:3000',
    methods:['GET','POST'],
  },
});

    io.on("connection",(socket) => {
    console.log("🔌User connected  to app:",socket.id);
    socket.emit("myid",socket.id);

    // Handle room joining
  //  socket.on('join_room', (room) => {
  //   socket.join(room); // Join the specified room
  //   console.log(`Socket ${socket.id} joined room ${room}`);
  // });
    //you Must match exactly:'with chat even name'
   // this is for broadcasting
    // socket.on("sendmessage",(msg) =>{
    // console.log("Server received message from app:",msg);
    // io.emit("sendback",msg);//broadcast to everyone
    //  });

    //   socket.on("sendmessage",(msg) =>{
    //  console.log("Server received message from app:",msg);
    //  socket.to(msg.room).emit("sendback",msg);//broadcast to everyone
    //  });
      // create room
      socket.on("createRoom",(roomName) =>{
       //const newRoom = { id: Date.now(), name: roomName };
       //rooms.push(newRoom);
       socket.join(roomName);
       console.log(`Socket ${socket.id} joined room ${roomName}`);
        // Save the room in socket instance
         socket.roomNumber = roomName;
        io.emit("checking",{sockets:socket.id,room:roomName}); // broadcast updated rooms
      
      });

           //Handle room joining
     socket.on("sendmessage",(msg) =>{
      console.log("Server received message from app:",msg);
      io.to(msg.room).emit("sendback",msg)
      // socket.to(msg.room).emit("sendback",msg);//broadcast to everyone
     });





    socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
     });
});



app.get('/', (req, res) => {
  res.send('Server is running');
});


// app.get('/', (req, res) => {
//     res.send(`welcome to render api`);  // Corrected URL
// });

server.listen(3001,() =>{
  console.log('Server listening on http://localhost:3001');
});



// .listen( () => {
//    console.log(`Server is running on port`);
// });
