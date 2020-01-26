const functions = require('firebase-functions');
const admin = require('firebase-admin');

const teams = require('./team');

// Firestore
const firestore = admin.firestore();

const DEFAULT_SETTINGS = {
	attemptsBeforeFreeze: 2,
	attemptsAfterFreeze: 1,
	assignBeginnerGroup: true,
	numRegularGroups: 4,
	numChallengeGroups: 3
};

const DEFAULT_STATUS = 0;

module.exports.courseIsLive = courseIsLive;
async function courseIsLive(courseRef) {
	// Grab data
	const courseData = (await courseRef.get()).data();

	// cehck whether status === live
	return courseData.status === 1;
}

module.exports.courseIsSetup = courseIsSetup;
async function courseIsSetup(courseRef) {
	// Grab data
	const courseData = (await courseRef.get()).data();

	// cehck whether status === setup
	return courseData.status === 0;
}

module.exports.courseIsArchived = courseIsArchived;
async function courseIsArchived(courseRef) {
	// Grab data
	const courseData = (await courseRef.get()).data();

	// cehck whether status === archived
	return courseData.status === 2;
}

module.exports.getCourseSettings = getCourseSettings;
async function getCourseSettings(courseRef) {
	// Grab data
	const courseData = (await courseRef.get()).data();

	// Return settings
	return courseData.settings;
}

module.exports.createCourse = createCourse;
async function createCourse(courseName, teacherRef) {
	// Grab teacher info
	const teacher = (await teacherRef.get());
	const teacherData = teacher.data();

	// Data for the course
	const courseData = {
		status: DEFAULT_STATUS,
		assignedReagentGroups: [],
		name: courseName,
		teacherRefs: [ {
			ref: teacherRef,
			name: teacherData.name,
			email: teacherData.email
		} ],
		teacherIds: [
			teacher.id
		],
		settings: DEFAULT_SETTINGS,
		timestamp: admin.firestore.Timestamp.now()
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

module.exports.goLive = goLive;
async function goLive(courseRef) {
	// Convert teams to real teams
	const setupTeams = courseRef.collection('setupTeams');
	const allDocs = await setupTeams.get();

	// For each team setup doc
	for (const setupTeam of allDocs.docs) {
		const data = setupTeam.data();
		const name = data.name;
		const members = data.members;

		// Create the team
		await teams.createGroup(courseRef, members, name);
	}

	// Update status
	await courseRef.update({
		status: 1
	});
}
