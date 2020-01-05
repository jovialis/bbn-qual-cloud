const functions = require('firebase-functions');
const admin = require('firebase-admin');

const errors = require('../lib/errors');
const user = require('../lib/user');
const session = require('../lib/session');

// Firestore
const firestore = admin.firestore();

module.exports = function(e) {

	// Returns a session for a course
	e.getClassSession = functions.https.onCall(async (data, context) => {
		// Ensure there's a user
		if (!context.auth.uid) {
			errors.userNotAuthenticated();
		}

		const teacherRef = user.getUserRef(context.auth.uid);
		if (!await user.isTeacher(teacherRef)) {
			errors.userNotTeacher();
		}

		const coursePath = data.coursePath;
		if (!coursePath) {
			errors.invalidCourse();
		}

		let courseRef = firestore.doc(coursePath);

		// TODO: Ensure teacher has access to this course

		const sessionRef = await session.getCourseActiveSession(courseRef);
		return {
			sessionPath: sessionRef ? sessionRef.path : null
		};
	});

	// Returns a student session
	e.getSession = functions.https.onCall(async (data, context) => {
		// Ensure there's a user
		if (!context.auth.uid) {
			errors.userNotAuthenticated();
		}

		// Check if there's a user
		const userRef = user.getUserRef(context.auth.uid);
		const userData = (await userRef.get()).data();

		const sessionRef = await session.getUserSession(userRef);

		// Extract session path and course/group path from user doc
		const sessionPath = (sessionRef == null ? null : sessionRef.path);
		const courseRef = userData.courseRef;
		const teamRef = userData.teamRef;

		// Grab basic overview data for course and team
		const courseData = (await courseRef.get()).data();
		const teamData = (await teamRef.get()).data();

		// Return session and basic course/team info
		return {
			sessionPath: sessionPath,
			course: {
				name: courseData.name,
				settings: courseData.settings
			},
			team: {
				members: teamData.memberRefs.map(rawRef => {
					// Remove user IDs from member map
					delete rawRef.ref;
					return rawRef
				})
			}
		};
	});

	e.startSession = functions.https.onCall(async (data, context) => {
		// Ensure there's a user
		if (!context.auth.uid) {
			errors.userNotAuthenticated();
		}

		// Check if there's a user
		const userRef = user.getUserRef(context.auth.uid);

		// Ensure user is a teacher
		if (!(await user.isTeacher(userRef))) {
			errors.userNotTeacher();
		}

		const courseId = data.courseId;
		const courseRef = firestore.collection('courses').doc(courseId);

		// Ensure course exists
		if (!courseId || !(await courseRef.get()).exists) {
			errors.invalidCourse();
		}

		const duration = data.duration;

		// Create session
		const sessionRef = await session.startSession(userRef, courseRef, duration);
		return {
			sessionPath: sessionRef.path,
			session: (await sessionRef.get()).data()
		};
	});

};
