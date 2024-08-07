const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 3000;

// Настройка подключения к базе данных SQLite
const db = new sqlite3.Database('./blog.db', (err) => {
    if (err) console.error('Ошибка подключения к базе данных:', err.message);
});

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Настройка сессий
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false
}));

// Middleware для проверки аутентификации
const checkAuth = (req, res, next) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        next();
    }
};

// Главная страница
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

// Страница регистрации
app.get('/register', (req, res) => {
    res.render('register');
});

// Обработка регистрации
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) throw err;
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], (err) => {
            if (err) {
                res.send('Ошибка при регистрации.');
            } else {
                res.redirect('/login');
            }
        });
    });
});

// Страница входа
app.get('/login', (req, res) => {
    res.render('login');
});

// Обработка входа
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user) {
            res.send('Неправильное имя пользователя или пароль.');
        } else {
            bcrypt.compare(password, user.password, (err, result) => {
                if (result) {
                    req.session.userId = user.id;
                    req.session.user = user.username;
                    res.redirect('/home');
                } else {
                    res.send('Неправильное имя пользователя или пароль.');
                }
            });
        }
    });
});

// Выход
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Главная страница авторизованного пользователя
app.get('/home', checkAuth, (req, res) => {
    res.render('home', { user: req.session.user });
});

// Страница создания нового поста
app.get('/newpost', checkAuth, (req, res) => {
    res.render('newpost');
});

// Обработка создания нового поста
app.post('/newpost', checkAuth, (req, res) => {
    const { title, content, private } = req.body;
    const userId = req.session.userId;
    db.run('INSERT INTO posts (user_id, title, content, private) VALUES (?, ?, ?, ?)',
        [userId, title, content, private ? 1 : 0], (err) => {
            if (err) {
                res.send('Ошибка при создании поста.');
            } else {
                res.redirect('/home');
            }
        });
});

// Страница поста
app.get('/post/:id', checkAuth, (req, res) => {
    const postId = req.params.id;
    console.log(`Получение поста с ID: ${postId}`); // Отладочный вывод

    db.get('SELECT * FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err) {
            console.error('Ошибка при получении поста:', err.message); // Отладочный вывод
            res.send('Ошибка при получении поста.');
        } else if (!post) {
            console.log('Пост не найден.'); // Отладочный вывод
            res.send('Пост не найден.');
        } else {
            console.log('Пост найден:', post); // Отладочный вывод

            db.all(`SELECT comments.comment, users.username
                    FROM comments
                    JOIN users ON comments.user_id = users.id
                    WHERE comments.post_id = ?

            `, [postId], (err, comments) => {
                if (err) {
                    console.error('Ошибка при загрузке комментариев:', err.message); // Отладочный вывод
                    res.send('Ошибка при загрузке комментариев.');
                } else {
                    console.log('Загруженные комментарии:', comments); // Отладочный вывод
                    res.render('post', { post, comments });
                }
            });
        }
    });
});



// Обработка добавления комментария
app.post('/comment', checkAuth, (req, res) => {
    const { postId, comment } = req.body;
    const userId = req.session.userId;
    db.run('INSERT INTO comments (post_id, user_id, comment) VALUES (?, ?, ?)', [postId, userId, comment], (err) => {
        if (err) {
            res.send('Ошибка при добавлении комментария.');
        } else {
            res.redirect('/post/' + postId);
        }
    });
});

// Страница "Мой блог"
app.get('/myblog', checkAuth, (req, res) => {
    const userId = req.session.userId;
    db.all('SELECT * FROM posts WHERE user_id = ?', [userId], (err, posts) => {
        if (err) {
            res.send('Ошибка при загрузке постов.');
        } else {
            res.render('myblog', { posts });
        }
    });
});

// Обработка удаления поста
app.post('/deletepost', checkAuth, (req, res) => {
    const postId = req.body.postId;
    db.run('DELETE FROM posts WHERE id = ?', [postId], (err) => {
        if (err) {
            res.send('Ошибка при удалении поста.');
        } else {
            res.redirect('/myblog');
        }
    });
});

// Страница "Блоги других пользователей"
app.get('/otherblogs', checkAuth, (req, res) => {
    db.all('SELECT * FROM users WHERE id != ?', [req.session.userId], (err, users) => {
        if (err) {
            res.send('Ошибка при загрузке пользователей.');
        } else {
            res.render('otherblogs', { users });
        }
    });
});

// Страница постов конкретного пользователя
app.get('/user/:id/posts', checkAuth, (req, res) => {
    const userId = req.params.id;
    db.get('SELECT username FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) {
            res.send('Пользователь не найден.');
        } else {
            db.all('SELECT * FROM posts WHERE user_id = ?', [userId], (err, posts) => {
                if (err) {
                    res.send('Ошибка при загрузке постов.');
                } else {
                    res.render('userposts', { username: user.username, posts });
                }
            });
        }
    });
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});
