const express = require('express');
const http = require('http'); // ✅ declare before using
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const db = require('./db');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const cors = require('cors');
const app = express();
const server = http.createServer(app); // now http is defined
const cookieParser = require('cookie-parser');
const PORT = 3001;
const JWT_SECRET ='bazirake';
    // Node HTTP server
app.use(cookieParser()); 
// Middleware
app.use(bodyParser.json());
app.use(express.json());
// Enable CORS with credentials
app.use(cors({
    origin:'https://orbitclass.vercel.app', // your frontend URL
    credentials:true // allow cookies
}));


app.post('/login', async (req, res) => {
  const { studentnumber, password } = req.body;

  db.query(
    `SELECT * ,c.description as levels FROM account INNER JOIN department ON account.DEPARTMENT = department.department_id INNER JOIN level c ON c.level_id =account.CLASSES INNER join user_type on account.USERTYPE=user_type.user_type_id WHERE studentnumber = ?`
    [studentnumber],
    async (err, results) => {
      if (err)
        return res.status(500).json({ message: 'Database error', error: err });

      if (results.length === 0) {
        return res.status(401).json({ message: 'Invalid student number or password' });
      }

      const user = results[0];

      if (!user.PASSWORD) {
        return res.status(500).json({ message: 'Password field missing for this account' });
      }

      try {
        const isMatch = await bcrypt.compare(password, user.PASSWORD);
        if (!isMatch) {
          return res.status(401).json({ message: 'Invalid student number or password' });
        }

        //Build a "safe" user object (exclude password hash)
        const userDetails = {
          id: user.ID,
          email: user.EMAIL,
          usertype: user.USERTYPE,
          studentnumber: user.studentnumber,
          fullname: user.FULLNAME,
          classes: user.CLASSES,
          tel: user.TEL,
          department_id: user.department_id,
          department_name: user.department_name, // <-- you had just department_name before
          description:user.description,
          type_name:user.type_name,
          levels:user.levels
        };

        // Create JWT with limited lifespan
        const token = jwt.sign(userDetails, JWT_SECRET, { expiresIn: '1h' });

        //Send HTTP-only cookie for cross-site
        res.cookie('token', token, {
          httpOnly: true,
          secure: true,      // true on production (HTTPS); false for local dev
          sameSite: 'none',  // required for cross-site cookie
          maxAge:60 * 60 * 1000 // 1 hour
        });

        // ✅ Return user details (no password)
        res.json({
          message:'Logged in successfully',
          user: userDetails
        });

      } catch (error) {
        console.error('Bcrypt compare error:', error);
        res.status(500).json({ message: 'Error verifying password' });
      }
    }
  );
});


// Test route
 app.get('/', (req, res) => {
    res.send(`https://orbitclassdb.onrender.com`);  // Corrected URL
});

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
  let sql = 'SELECT * FROM menu_items';
  let params = [];
  if (usertype) {
    sql +=' WHERE usertype= ?';
    params.push(usertype);
  }
  db.query(sql,params,(err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
        res.json({
       results
    });
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
        const hashedPassword = await bcrypt.hash(password, 10);
        db.query(
            `INSERT INTO account
            (fullname,department,classes,studentnumber,email,password,usertype,tel) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [fullname, department, classes, studentnumber, email, hashedPassword, usertype, tel],
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
    const { department_name, description } = req.body;

    if (!department_name) {
        return res.status(400).json({ error: 'department_name is required' });
    }
    const sql = 'INSERT INTO department (department_name, description) VALUES (?, ?)';
    db.query(sql, [department_name, description || null], (err, result) => {
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

// Start server
// app.listen(PORT, () => {
//     console.log(`Server is running on http://localhost:${PORT}`);
// });

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin:'https://orbitclass.vercel.app',
    methods:['GET','POST'],
  },
});

    io.on("connection",(socket) => {
    console.log("🔌User connected  to app:", socket.id);
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
       //io.emit("send", rooms); // broadcast updated rooms
      });

        // Handle room joining
      socket.on("sendmessage",(msg) =>{
      console.log("Server received message from app:",msg);
      io.to(msg.room).emit("sendback",msg)
      // socket.to(msg.room).emit("sendback",msg);//broadcast to everyone
     });

    socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
     });
});

server.listen(() => {
  console.log(`🚀 Server running on port`);
});