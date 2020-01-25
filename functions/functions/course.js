const functions = require('firebase-functions');
const admin = require('firebase-admin');

const errors = require('../lib/errors');
const user = require('../lib/user');
const session = require('../lib/session');
const courses = require('../lib/course');

// Firestore
const firestore = admin.firestore();

// default course settings

module.exports = function(e) {

	// Create a reagent list for the course upon creation
	e.createReagentGroupUponCourseCreation = functions.firestore.document('courses/{courseId}')
		.onCreate(async (snapshot, context) => {
		const firestore = admin.firestore();

		// Instantiate reagent group list for this course
		const defaultReagentListDocument = await firestore.collection("reagentGroups").doc('default').get();
		if (!defaultReagentListDocument.exists) {
			return Promise.reject('Encountered a problem accessing the default reagent list.');
		}

		// Create the actual reagent list document
		const newReagentListRef = firestore.collection('reagentGroups').doc();
		await newReagentListRef.set(defaultReagentListDocument.data());

		// Define defaults for new document
		const data = {
			reagentGroupRef: newReagentListRef
		};

		// Update course data with the reagent group reference
		await snapshot.ref.update(data);
	});

	// Create a group upon request from a teacher
	e.createCourseUponTeacherRequest = functions.https.onCall(async (data, context) => {
		// Only let teachers create a course
		const teacherRef = user.getUserRef(context.auth.uid);
		if (!(await user.isTeacher(teacherRef))) {
			errors.userNotTeacher();
		}

		// Name
		const courseName = data.name;
		if (!courseName) {
			errors.invalidCourseName();
		}

		const courseRef = await courses.createCourse(courseName, teacherRef);
		return {
			courseRef: courseRef
		};
	});

	// Update the list of teacher IDs whenever the docoument is updated, presumably with new teachers
	e.updateTeacherUIDSOnCourseUpdate = functions.firestore.document('/courses/{courseId}').onUpdate(async (snapshot, context) => {
		// Update the document with teacher uids if the teacherRefs has been changed
		const newTeachers = snapshot.after.data().teacherRefs;

		// Only update teacher ids if something is changed
		if (newTeachers !== snapshot.before.data().teacherRefs) {
			// Map to teacher ids
			const teacherIds = newTeachers.map(teacher => teacher.ref.id);

			// Save teacher ids
			await snapshot.after.ref.update({
				teacherIds: teacherIds
			});
		}
	});

};

