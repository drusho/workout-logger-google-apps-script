# Workout Logger & Progressive Overload Assistant
Created By: David Rusho

## Overview & Motivation

This project, Rusho's Workout Logger, originated from the need for a personalized, mobile-friendly tool to meticulously track strength </br>
training progress and, more importantly, to automate progressive overload based on perceived effort. As a single-user application, it leverages </br>
the seamless integration of Google Sheets as a database and Google Apps Script for both backend logic and serving a web application interface. </br>
The primary goal is to provide intelligent workout suggestions that adapt to the user's performance, ensuring continuous and optimized strength gains.

The application is designed for use on a mobile device (initially targeted for an Android Pixel 9) to allow for easy logging directly in the gym.

## Features

* **Dynamic Workout Template System:** Select from predefined workout plans.
* **Detailed Plan Summaries:** View all exercises, prescribed sets, reps, and calculated weights for the selected plan before logging.
* **Comprehensive Exercise Logging:** Log sets, reps (including AMRAP - As Many Reps As Possible), weight used, RPE (0-10 scale), and personal notes </br>
for each exercise.
* **RPE-Based Progression:** Automatically updates the user's progression stage for an exercise based on logged RPE, facilitating automated progressive </br>
overload.
* **Last Workout Recall:** Displays key details from the last time an exercise was logged (within the current plan) when selected, providing immediate context.
* **Customizable Backend:** All data, including the exercise library, workout templates, and progression models, is managed directly within a Google Sheet, </br>
allowing for easy customization.
* **User-Friendly Interface:** Clean, responsive design optimized for mobile use, built with Bootstrap and enhanced with Font Awesome icons.
* **Interactive UI Elements:** Includes features like an auto-filled RPE default, animated submit button, and loading indicators for a smoother experience.


## Core Functionality from a User's Perspective

The web app provides a streamlined interface for managing and logging workouts:

1.  **Workout Selection:** The user starts by selecting a pre-defined "Workout Plan" from a dropdown. These plans are configured by the user in the backend </br>
Google Sheet.
2.  **Dynamic Plan Summary:** Upon selecting a plan, a summary is displayed, listing all exercises scheduled for that workout. This summary includes the exact </br>
sets, reps, and calculated weights prescribed for the current session, dynamically generated based on the user's past performance and the progression model </br>
assigned to each exercise. Exercises already logged for the day are visually marked.
3.  **Exercise Logging:**
    * The user selects an individual exercise from the plan to log.
    * **Contextual Recall:** Immediately, a "toast" message appears showing key details (sets, reps, weight, RPE, notes) from the *last time* this exercise was </br>
    logged under the current workout plan, providing quick reference.
    * The logging form pre-fills with the planned sets, reps, and weight for the current session. The Rate of Perceived Exertion (RPE) field defaults to 8, a </br>
    common target for working sets.
    * The user inputs their actual performance: sets completed, reps achieved (with a dedicated field for actual reps if the set was As Many Reps As Possible - </br>
    AMRAP), weight lifted, and the RPE for their working sets. Optional notes can also be added.
4.  **Submission & Progression:**
    * Upon clicking the "Submit Exercise" button (which features loading and success/check animations), the data is sent to the backend.
    * The workout is recorded in the `WorkoutLog` sheet.
    * Crucially, the system then evaluates the logged RPE against the rules defined in the exercise's `ProgressionModel`. If progression criteria are met (e.g., </br>
    RPE at or below a certain threshold like 8), the user's current training parameters (e.g., current step in the progression, estimated 1RM) are updated in the </br>
    `UserExerciseProgression` sheet. This ensures that the *next time* this workout plan is loaded, the prescribed weights or reps for that exercise will be </br>
    appropriately increased, automating progressive overload.


## Technical Architecture & Design 

This project is built entirely within the Google Workspace ecosystem, utilizing Google Apps Script to create a dynamic web application powered by a Google Sheet </br>
acting as its database.

**1. Platform: Google Apps Script Web App**

* **Server-Side (`main.js` or `Code.gs`):** Google Apps Script (JavaScript-based) runs on Google's servers.
    * A `doGet(e)` function serves the main HTML interface (`LogExercise.html`) using `HtmlService.createTemplateFromFile().evaluate()`.
    * Client-server communication is handled via `google.script.run`, allowing the frontend JavaScript to call server-side Apps Script functions and receive data </br>
    in return.
* **Frontend (`LogExercise.html`):**
    * A single HTML file structures the user interface.
    * **Bootstrap 5** is used for responsive design and UI components, making it mobile-friendly.
    * **Font Awesome 6** provides iconography for the header, submit button states (paper plane, loading spinner, checkmark), and loader.
    * **Client-side JavaScript** (embedded in `LogExercise.html`):
        * Manages all DOM manipulations and event handling (e.g., dropdown changes, form submission).
        * Updates the UI dynamically based on user selections and data received from the server (e.g., populating workout summaries, prefilling forms, displaying </br>
        last workout details).
        * Handles visual states for elements like the animated submit button and full-page loader.


**2. Backend Data Management: Google Sheets**

The entire data backend is a single Google Sheet containing eight specialized tabs (sheets). This design allows for direct and easy data viewing, modification, and </br>
backup by the user.

* **Sheet Tabs & Their Roles:**
    1.  `WorkoutLog`: A historical record of every exercise set logged, including timestamp, exercise details, sets, reps, weight, RPE, notes, and links to the template </br>
    and progression model used.
    2.  `ExerciseLibrary`: A comprehensive list of all exercises known to the system, with details like name, alias, equipment type, primary muscles, default unit of </br>
    measurement, etc. This is the master list of exercises.
    3.  `WorkoutTemplates`: Defines high-level workout plans or splits (e.g., "Full Body A," "Push Day").
    4.  `TemplateExerciseList`: The bridge between `WorkoutTemplates` and `ExerciseLibrary`. It lists which exercises belong to each template, their order, any specific </br>
    notes for that exercise within the template, and critically, assigns a `ProgressionModelID` to it.
    5.  `Users`: Basic user information (though the app is functionally single-user, this structure allows for future extension). The `UserID` is used to link logs and </br>
    progression.
    6.  `UserExerciseProgression`: This is a key dynamic sheet. It tracks the user's current state for each exercise *within a specific template and progression model*. </br>
    It stores the `CurrentStepNumber` in their progression, their `CurrentCycle1RMEstimate` (or a similar metric like Max Reps for bodyweight exercises), last workout RPE, </br>
    etc. This sheet is automatically updated by the app after each logged workout.
    7.  `ProgressionModels`: Defines various strategies for how to progress on exercises (e.g., an 8-step RPE-based cycle, a linear progression, a bodyweight max-reps </br>
    percentage model). It includes logic for when to advance a step, when a cycle is complete, and how to calculate new base weights/metrics for the next cycle.
    8.  `ProgressionModelSteps`: Details each individual step within each `ProgressionModel`. This includes formulas for `TargetSetsFormula`, `TargetRepsFormula`, and </br>
    `TargetWeightFormula`. These formulas dynamically calculate the prescribed workout based on values from the `UserExerciseProgression` sheet (like </br>
    `CurrentCycle1RMEstimate` or `UserMaxReps`).



## How It Works (Application Flow)

1.  **Open Web App:** User accesses the deployed web app URL on their mobile device.
2.  **Select Workout Plan:** The user chooses a plan from the "Workout Plan" dropdown.

    <img src="https://github.com/drusho/workout-logger-google-apps-script/blob/main/images/1.2%20-%20select%20exercise.gif?raw=true" width="400"> </br>

3.  **View Plan Summary:** The app displays a summary of the selected plan, listing all exercises with their prescribed sets, reps, </br>
    and calculated weights. 
    These prescriptions are dynamically calculated based on the user's current progression (`UserExerciseProgression`), the exercise's </br>
    assigned progression model (`ProgressionModelSteps`), and base exercise data (`ExerciseLibrary`).

     <img src="https://github.com/drusho/workout-logger-google-apps-script/blob/main/images/1.3%20-%20select%20exercise.gif?raw=true" width="400"> </br>

4.  **Select Exercise to Log:** The user picks an exercise from the "Select exercise" dropdown, which lists exercises from the currently </br>
    active workout plan summary.

- <img src="https://github.com/drusho/workout-logger-google-apps-script/blob/main/images/2%20-%20select%20exercise.gif?raw=true" width="400"> </br>

5.  **Contextual Information:**
    * The form pre-fills with the planned sets, reps, and weight for that exercise.
    * The RPE field defaults to "8".
    * A "toast" message appears below the exercise dropdown showing key details from the *last time* that specific exercise was logged </br>
    under the current template (e.g., "Last time (MM/DD): 3 sets of 10 reps @ 100 lbs, RPE 7").
6.  **Log Performance:** The user inputs their actual performance: sets performed, reps achieved (including actual reps for AMRAP sets), </br>
    weight used, their RPE for the set(s), and any optional notes.

7.  **Submit Log:** Upon clicking "Submit Exercise":
    * The button shows a loading animation.
    * The data is sent to the Google Apps Script backend.

     <img src="https://github.com/drusho/workout-logger-google-apps-script/blob/main/images/3%20-%20submit%20workout.gif?raw=true" width="400"> </br> 

8.  **Backend Processing:**
    * The script logs the workout details into the `WorkoutLog` sheet.
    * Crucially, it then updates the `UserExerciseProgression` sheet. Based on the logged RPE against the exercise's `ProgressionModel`, </br>
    it determines if the user met progression criteria (e.g., RPE <= 8). If so, it advances the `CurrentStepNumber` for that exercise in </br>
    that template, potentially recalculating `CurrentCycle1RMEstimate` if a cycle is completed.

9.  **Feedback:** The button shows a checkmark for success, and a status message confirms the log. </br>
    The workout summary on the page also visually indicates that the exercise has been logged for the day. </br>
    The next time this exercise is loaded, its prescription will reflect any progression. </br> </br>
     <img src="https://github.com/drusho/workout-logger-google-apps-script/blob/main/images/4%20-%20submit%20workout.gif?raw=true" width="400">

## Customization

The power of this application lies in its Google Sheets backend, allowing for deep customization:

* **Exercises:** Add new exercises, define their properties, equipment, etc., in the `ExerciseLibrary`.
* **Workout Templates:** Design new workout routines in `WorkoutTemplates` and link exercises to them in `TemplateExerciseList`.
* **Progression Strategies:** Create highly customized progression models (e.g., different RPE targets, rep/set schemes, percentage-based </br>
loading) in `ProgressionModels` and detail each step in `ProgressionModelSteps`. The formulas in `ProgressionModelSteps` can reference the </br>
user's current estimated 1RM or max reps from the `UserExerciseProgression` sheet.

## Technology Stack Summary

* **Platform:** Google Workspace (Google Sheets, Google Apps Script)
* **Backend Scripting:** Google Apps Script (JavaScript)
* **Frontend:** HTML5, CSS3, JavaScript (ES5/ES6 compatible with Apps Script V8 runtime)
* **UI Framework:** Bootstrap 5
* **Icons:** Font Awesome 6
* **Data Storage:** Google Sheets
    

## Future Development Ideas

* *Graphing/charting of progress over time.*
* *Modifying Workout Routines From the Webapp.*
* *Multiple Users.*
* *Support for different types of sets (e.g., drop sets, warm-up sets).*

---

*This README was last updated on May 18, 2025.*