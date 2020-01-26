const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize app
admin.initializeApp();

const gameplay = require('./functions/gameplay');
gameplay(exports);

const course = require('./functions/course');
course(exports);

const groups = require('./functions/teams');
groups(exports);

const sessions = require('./functions/sessions');
sessions(exports);

const users = require('./functions/users');
users(exports);
