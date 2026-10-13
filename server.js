const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const PORT = 3000;
const JWT_SECRET = 'DASHAVOCGEHEIMNIS123!'; 

const db = new sqlite3.Database('havoc.db', (err) => {
    if (err) return console.error("Datenbank-Fehler:", err.message);
    console.log('Erfolgreich mit der HAVOC-Datenbank verbunden.');
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, path.join(__dirname, '../uploads')); },
    filename: function (req, file, cb) { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

// --- SCHEMA INITIALIZATION ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)`);
    
    // HIER KORRIGIERT: image_url auf LONGTEXT gesetzt, um gigantische Base64-Bilder abzuspeichern!
    db.run(`CREATE TABLE IF NOT EXISTS artists (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, genre TEXT, image_url TEXT, bio TEXT, bio_en TEXT, spotify_url TEXT, youtube_url TEXT, website_url TEXT, instagram_url TEXT, tiktok_url TEXT)`);
    
    db.run(`CREATE TABLE IF NOT EXISTS dates (id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id INTEGER, date TEXT, city TEXT, venue TEXT, link TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS artist_images (id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id INTEGER, gallery_url TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS team (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, email TEXT, hobbies TEXT, bio TEXT, image_url TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    
    db.run(`CREATE TABLE IF NOT EXISTS agency_shows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        city TEXT NOT NULL,
        venue TEXT NOT NULL,
        ticket_url TEXT,
        info_text TEXT,
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // HIER AUCH FÜR DIE NEWS KORRIGIERT: image_url auf LONGTEXT gesetzt!
    db.run(`CREATE TABLE IF NOT EXISTS news (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, text TEXT, image_url LONGTEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    const defaultUser = 'admin';
    const defaultPassword = 'havocPassword123';
    db.get(`SELECT * FROM users WHERE username = ?`, [defaultUser], (err, row) => {
        if (!row) {
            bcrypt.hash(defaultPassword, 10, (err, hash) => {
                db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [defaultUser, hash]);
                console.log('--- Standard-Admin wurde erstellt (admin / havocPassword123) ---');
            });
        }
    });
});

// --- AUTHENTICATION FILTER ---
const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Zugriff verweigert.' });
    const token = authHeader.replace(/^Bearer\s+/, "");
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Sitzung abgelaufen.' });
        req.user = user;
        next();
    });
};

// --- LOGIN ENDPOINT ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'Benutzername existiert nicht.' });
        bcrypt.compare(password, user.password, (err, match) => {
            if (match) {
                const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '2h' });
                res.json({ success: true, token });
            } else { res.status(400).json({ error: 'Falsches Passwort.' }); }
        });
    });
});
// --- KÜNSTLER-ROUTEN ---
app.post('/api/artists', authenticateAdmin, upload.single('image'), (req, res) => {
    const { name, genre, bio, bio_en, spotify_url, youtube_url, website_url, instagram_url, tiktok_url } = req.body;
    if (!name) return res.status(400).json({ error: 'Bitte gib einen Bandnamen an.' });
    let image_url = '';
    if (req.file) image_url = `https://onrender.com{req.file.filename}`; // KORRIGIERT: /uploads/ hinzugefügt
    db.run(`INSERT INTO artists (name, genre, image_url, bio, bio_en, spotify_url, youtube_url, website_url, instagram_url, tiktok_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [name, genre, image_url, bio || '', bio_en || '', spotify_url || '', youtube_url || '', website_url || '', instagram_url || '', tiktok_url || ''], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Künstler erfolgreich gespeichert!' });
    });
});

app.put('/api/artists/:id', authenticateAdmin, upload.single('image'), (req, res) => {
    const { name, genre, bio, bio_en, spotify_url, youtube_url, website_url, instagram_url, tiktok_url } = req.body;
    const artistId = req.params.id;
    if (!name) return res.status(400).json({ error: 'Bitte gib einen Bandnamen an.' });

    if (req.file) {
        const image_url = `https://onrender.com{req.file.filename}`; // KORRIGIERT: /uploads/ hinzugefügt
        db.run(`UPDATE artists SET name = ?, genre = ?, image_url = ?, bio = ?, bio_en = ?, spotify_url = ?, youtube_url = ?, website_url = ?, instagram_url = ?, tiktok_url = ? WHERE id = ?`,
            [name, genre, image_url, bio, bio_en, spotify_url, youtube_url, website_url, instagram_url, tiktok_url, artistId], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Künstlerprofil erfolgreich aktualisiert!' });
            });
    } else {
        db.run(`UPDATE artists SET name = ?, genre = ?, bio = ?, bio_en = ?, spotify_url = ?, youtube_url = ?, website_url = ?, instagram_url = ?, tiktok_url = ? WHERE id = ?`,
            [name, genre, bio, bio_en, spotify_url, youtube_url, website_url, instagram_url, tiktok_url, artistId], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Künstlerprofil erfolgreich aktualisiert!' });
            });
    }
});

app.delete('/api/artists/:id', authenticateAdmin, (req, res) => {
    const artistId = req.params.id;
    db.run(`DELETE FROM dates WHERE artist_id = ?`, [artistId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`DELETE FROM artist_images WHERE artist_id = ?`, [artistId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            db.run(`DELETE FROM artists WHERE id = ?`, [artistId], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Künstler gelöscht!' });
            });
        });
    });
});

app.get('/api/artists', (req, res) => {
    db.all(`SELECT * FROM artists ORDER BY name ASC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.get('/api/artists/:id', (req, res) => {
    db.get(`SELECT * FROM artists WHERE id = ?`, [req.params.id], (err, artist) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!artist) return res.status(404).json({ error: 'Künstler nicht gefunden.' });
        db.all(`SELECT * FROM dates WHERE artist_id = ? ORDER BY date ASC`, [req.params.id], (err, dates) => {
            if (err) return res.status(500).json({ error: err.message });
            artist.dates = dates || [];
            db.all(`SELECT * FROM artist_images WHERE artist_id = ?`, [req.params.id], (err, imgs) => {
                if (err) return res.status(500).json({ error: err.message });
                artist.gallery = imgs || [];
                res.json(artist);
            });
        });
    });
});

// --- GALERIE-ROUTEN ---
app.post('/api/gallery', authenticateAdmin, upload.single('galleryImage'), (req, res) => {
    const { artist_id } = req.body;
    if (!artist_id || !req.file) return res.status(400).json({ error: 'Fehlende Daten.' });
    db.get(`SELECT COUNT(*) as count FROM artist_images WHERE artist_id = ?`, [artist_id], (err, row) => {
        if (row && row.count >= 8) return res.status(400).json({ error: 'Maximale Anzahl von 8 Bildern erreicht!' });
        const gallery_url = `https://onrender.com{req.file.filename}`; // KORRIGIERT: /uploads/ hinzugefügt
        db.run(`INSERT INTO artist_images (artist_id, gallery_url) VALUES (?, ?)`, [artist_id, gallery_url], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Galeriebild hinzugefügt!' });
        });
    });
});

app.delete('/api/gallery/:id', authenticateAdmin, (req, res) => {
    db.run(`DELETE FROM artist_images WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Galeriebild entfernt!' });
    });
});

// --- TOURDATEN-ROUTEN ---
app.post('/api/dates', authenticateAdmin, (req, res) => {
    const { artist_id, date, city, venue, link } = req.body;
    db.run(`INSERT INTO dates (artist_id, date, city, venue, link) VALUES (?, ?, ?, ?, ?)`, 
        [artist_id, date, city, venue, link || ''], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Tourtermin gespeichert!' });
    });
});

app.put('/api/dates/:id', authenticateAdmin, (req, res) => {
    const { artist_id, date, city, venue, link } = req.body;
    db.run(`UPDATE dates SET artist_id = ?, date = ?, city = ?, venue = ?, link = ? WHERE id = ?`,
        [artist_id, date, city, venue, link, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Tourtermin aktualisiert!' });
        });
});

app.delete('/api/dates/:id', authenticateAdmin, (req, res) => {
    db.run(`DELETE FROM dates WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Tourtermin gelöscht!' });
    });
});

app.get('/api/dates-all', (req, res) => {
    const query = `SELECT dates.*, artists.name AS artist_name FROM dates JOIN artists ON dates.artist_id = artists.id ORDER BY artists.name ASC, dates.date ASC`;
    db.all(query, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});
// --- NEWS-ROUTEN ---
app.post('/api/news', authenticateAdmin, upload.single('image'), (req, res) => {
    const { title, text } = req.body;
    if (!title || !text) return res.status(400).json({ error: 'Bitte Titel und Text ausfüllen.' });
    let image_url = '';
    if (req.file) image_url = `https://onrender.com{req.file.filename}`; // KORRIGIERT: /uploads/ hinzugefügt

    db.run(`INSERT INTO news (title, text, image_url) VALUES (?, ?, ?)`, [title, text, image_url], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'News-Beitrag erfolgreich veröffentlicht!' });
    });
});

app.put('/api/news/:id', authenticateAdmin, upload.single('image'), (req, res) => {
    const { title, text } = req.body;
    if (!title || !text) return res.status(400).json({ error: 'Bitte Titel und Text ausfüllen.' });

    if (req.file) {
        const image_url = `https://onrender.com{req.file.filename}`; // KORRIGIERT: /uploads/ hinzugefügt
        db.run(`UPDATE news SET title = ?, text = ?, image_url = ? WHERE id = ?`, [title, text, image_url, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'News-Beitrag erfolgreich aktualisiert!' });
        });
    } else {
        db.run(`UPDATE news SET title = ?, text = ? WHERE id = ?`, [title, text, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'News-Beitrag erfolgreich aktualisiert!' });
        });
    }
});

app.delete('/api/news/:id', authenticateAdmin, (req, res) => {
    db.run(`DELETE FROM news WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'News-Beitrag erfolgreich gelöscht!' });
    });
});

app.get('/api/news', (req, res) => {
    db.all(`SELECT * FROM news ORDER BY created_at DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.setHeader('Content-Type', 'application/json');
        res.json(rows || []);
    });
});

// --- TEAM-ROUTEN ---
app.get('/api/team', (req, res) => {
    db.all(`SELECT * FROM team ORDER BY name ASC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.setHeader('Content-Type', 'application/json');
        res.json(rows || []);
    });
});

app.post('/api/team', authenticateAdmin, (req, res) => {
    const { name, phone, email, hobbies, bio, image_url } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Bitte Name und E-Mail-Adresse ausfüllen.' });

    db.run(`INSERT INTO team (name, phone, email, hobbies, bio, image_url) VALUES (?, ?, ?, ?, ?, ?)`, 
        [name, phone, email, hobbies || '', bio || '', image_url || ''], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Teammitglied erfolgreich hinzugefügt!' });
    });
});

app.delete('/api/team/:id', authenticateAdmin, (req, res) => {
    db.run(`DELETE FROM team WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Teammitglied erfolgreich gelöscht!' });
    });
});

app.post('/api/contact', (req, res) => { res.json({ success: true, message: 'Anfrage übermittelt.' }); });

// --- AGENCY SHOWS API ---
app.get('/api/agency-shows', (req, res) => {
    db.all("SELECT * FROM agency_shows ORDER BY date ASC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.setHeader('Content-Type', 'application/json');
        res.json(rows || []);
    });
});

app.get('/api/agency-shows/:id', (req, res) => {
    db.get("SELECT * FROM agency_shows WHERE id = ?", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Show nicht gefunden" });
        res.json(row);
    });
});

app.post('/api/agency-shows', authenticateAdmin, (req, res) => {
    const { title, date, city, venue, ticket_url, info_text, image_url } = req.body;
    if (!title || !date || !city || !venue) {
        return res.status(400).json({ error: "Bitte alle Pflichtfelder (Titel, Datum, Stadt, Location) ausfüllen." });
    }
    
    const query = `INSERT INTO agency_shows (title, date, city, venue, ticket_url, info_text, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(query, [title, date, city, venue, ticket_url || '', info_text || '', image_url || ''], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Agency-Show erfolgreich veröffentlicht!', id: this.lastID });
    });
});

app.delete('/api/agency-shows/:id', authenticateAdmin, (req, res) => {
    db.run(`DELETE FROM agency_shows WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Agency-Show erfolgreich aus der Datenbank gelöscht!' });
    });
});

// SERVER INSTANTIATION
app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`HAVOC Backend läuft auf: http://localhost:${PORT}`);
    console.log(`==================================================`);
});
