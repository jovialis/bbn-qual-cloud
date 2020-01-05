const functions = require('firebase-functions');
const admin = require('firebase-admin');

const errors = require('../lib/errors');
const users = require('../lib/user');
const session = require('../lib/session');
const courses = require('../lib/course');
const team = require('../lib/team');

// Firestore
const firestore = admin.firestore();

const DEFAULT_USER_ACCESS = 0;

module.exports = function(e) {

	e.testingCreateCourse = functions.https.onRequest(async (req, res) => {
		const name = req.body.name;

		// Create course
		const ref = await courses.createCourse(name, null);
		res.json({ ref: ref.path });
	});

	e.testingCreateGroup = functions.https.onRequest(async (req, res) => {
		const course = req.body.coursePath;
		const courseRef = firestore.doc(course);

		const ref = await team.createGroup(courseRef);

		res.json({ ref: ref.path });
	});

	e.testingStartSession = functions.https.onRequest(async (req, res) => {
		const course = req.body.coursePath;
		const courseRef = firestore.doc(course);

		const sessionRef = await session.startSession(null, courseRef, 60);

		res.json({ref: sessionRef.path});
	});

};
