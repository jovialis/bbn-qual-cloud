const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Firestore
const firestore = admin.firestore();

const DEFAULT_SETTINGS = {
	attemptsBeforeFreeze: 2,
	attemptsAfterFreeze: 1,
	assignBeginnerGroup: true,
	numRegularGroups: 4,
	numChallengeGroups: 3
};

module.exports.getCourseSettings = getCourseSettings;
async function getCourseSettings(courseRef) {
	// Grab data
	const courseData = (await courseRef.get()).data();

	// Return settings
	return courseData.settings;
}

module.exports.createCourse = createCourse;
async function createCourse(courseName, teacherRef) {
	// Data for the course
	const courseData = {
		archived: false,
		assignedReagentGroups: [],
		live: false,
		name: courseName,
		teacherRefs: [ teacherRef ],
		settings: DEFAULT_SETTINGS
	};

	// Set course data
	const courseRef = firestore.collection('courses').doc();
	await courseRef.set(courseData);

	// Create course
	return courseRef;
}

module.exports.userIsTeacherInCourse = userIsTeacherInCourse;
async function userIsTeacherInCourse(teacherRef, courseRef) {
	// Check to make sure the user has an auth level
	const teacherData = (await teacherRef.get()).data();

	// Student
	if (teacherData.access === 0) {
		return false;
	} else if (teacherData.access === 2) { // Admin
		return true;
	} else {
		// Ensure that course teachers contains user
		const courseData = (await courseRef.get()).data();
		return courseData.teacherRefs.includes(teacherRef);
	}
}
