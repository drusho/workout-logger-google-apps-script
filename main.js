// --- Global Configuration (Sheet Names) ---
const SHEET_NAMES = {
  WORKOUT_LOG: "WorkoutLog",
  EXERCISE_LIBRARY: "ExerciseLibrary",
  WORKOUT_TEMPLATES: "WorkoutTemplates",
  TEMPLATE_EXERCISE_LIST: "TemplateExerciseList",
  PROGRESSION_MODELS: "ProgressionModels",
  PROGRESSION_MODEL_STEPS: "ProgressionModelSteps",
  USER_EXERCISE_PROGRESSION: "UserExerciseProgression"
};

// --- Available Equipment Weights ---
const AVAILABLE_SINGLE_DUMBBELL_WEIGHTS = [
  1, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5,
  40, 42.5, 45, 47.5, 50, 52.5, 55, 57.5, 60, 62.5, 65, 67.5, 70, 72.5, 75,
  77.5, 80, 82.5, 85
];

const AVAILABLE_TOTAL_BARBELL_WEIGHTS = [
  45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135,
  140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200, 205, 210, 215,
  220, 225, 230, 235, 240, 245, 250, 255, 260, 265, 270, 275, 280, 285, 290,
  295, 300, 305, 310, 315
];
const OLYMPIC_BARBELL_WEIGHT = 45;
const EZ_BAR_WEIGHT = 20;

// --- Memoization for Sheet Data (Cache) ---
const SCRIPT_CACHE = CacheService.getScriptCache();
const CACHE_EXPIRATION_SECONDS = 300;

// --- Web App Entry Point ---
function doGet(e) {
  // Check for a special parameter to clear the cache
  if (e && e.parameter && e.parameter.clearCache === "true") {
    const scriptCache = CacheService.getScriptCache();
    const keysToClear = [ // List all your cache keys here
      "workoutTemplatesData",
      "templateExerciseListData",
      "progressionModelStepsData",
      "exerciseLibraryData",
      "workoutLogData_singleUser",
      "userExerciseProgressionData"
      // Add any other cache keys you might have defined
    ];
    scriptCache.removeAll(keysToClear);
    Logger.log("Manually cleared specified script caches via URL parameter.");
    return ContentService.createTextOutput("Cache has been cleared. Please reload the main app URL without the clearCache parameter.");
  }

  // Your existing doGet logic
  // Logger.log(`>>> doGet called. Parameters: ${JSON.stringify(e.parameter)}`);
  return HtmlService.createTemplateFromFile("LogExercise")
    .evaluate()
    .setTitle("Rusho's Workout Logger")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// --- Helper Functions for Sheet Interaction ---
function getAppSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = {};
  const criticalSheetKeys = Object.keys(SHEET_NAMES);

  for (const key of criticalSheetKeys) {
    const sheetName = SHEET_NAMES[key];
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      const errorMsg = `Error: Sheet "${sheetName}" not found!`;
      Logger.log(errorMsg);
      throw new Error(errorMsg);
    }
    const camelCaseKey = sheetName.charAt(0).toLowerCase() + sheetName.slice(1).replace(/([_A-Z])/g, group => group.toUpperCase().replace('_', ''));
    sheets[camelCaseKey + 'Sheet'] = sheet;
  }
  return sheets;
}

function getHeaders(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return [];
  try {
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(header => String(header).trim());
  } catch (e) { Logger.log(`Error getting headers from sheet "${sheet.getName()}": ${e.message}`); return []; }
}

function getSheetDataWithHeadersAndMap(sheet, cacheKey) {
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) return JSON.parse(cached);

  Logger.log(`Cache MISS for ${cacheKey}. Fetching from sheet: ${sheet.getName()}`);
  if (!sheet || sheet.getLastRow() < 1) {
    const emptyResult = { headers: [], data: [], headerMap: {} };
    SCRIPT_CACHE.put(cacheKey, JSON.stringify(emptyResult), CACHE_EXPIRATION_SECONDS);
    return emptyResult;
  }
  const headers = getHeaders(sheet);
  const headerMap = createHeaderMap(headers);
  let data = (sheet.getLastRow() > 1) ? sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues() : [];
  const result = { headers, data, headerMap };
  try { SCRIPT_CACHE.put(cacheKey, JSON.stringify(result), CACHE_EXPIRATION_SECONDS); }
  catch (e) { Logger.log(`Error caching ${cacheKey}: ${e.message}`); }
  return result;
}

function createHeaderMap(headers) {
  const map = {};
  if (!headers || headers.length === 0) return map;
  headers.forEach((header, index) => { if (header) map[header.trim()] = index; });
  return map;
}

function findRowInDataByCriteria(data, headerMap, criteria) {
  if (!data || !headerMap || !criteria) return null;
  return data.find(row =>
    Object.keys(criteria).every(key =>
      headerMap[key] !== undefined && row[headerMap[key]] !==
      undefined && String(row[headerMap[key]]).trim() ===
      String(criteria[key]).trim()
    )
  ) || null;
}

// --- Core Application Logic ---

function getAvailableWorkoutTemplates() {
  try {
    const sheets = getAppSheets();
    const { data: templateData, headerMap } = getSheetDataWithHeadersAndMap(sheets.workoutTemplatesSheet, "workoutTemplatesData");
    if (headerMap.TemplateID === undefined || headerMap.TemplateName === undefined) {
      throw new Error("WorkoutTemplates sheet is missing TemplateID or TemplateName header.");
    }
    return templateData.map(row => ({
      templateId: row[headerMap.TemplateID],
      templateName: row[headerMap.TemplateName]
    })).filter(t => t.templateId && t.templateName);
  } catch (error) {
    Logger.log(`Error in getAvailableWorkoutTemplates: ${error.message}`);
    throw new Error(`Failed to get workout templates: ${error.message}`);
  }
}

function adjustWeightToAvailableIncrements(targetWeight, equipmentType) {
  let adjustedWeight = targetWeight;
  if (isNaN(targetWeight)) return {
    adjustedWeight: 0, originalWeight: targetWeight
  };
  if (targetWeight <= 0) return {
    adjustedWeight: Math.max(0, targetWeight), originalWeight: targetWeight
  };

  switch (String(equipmentType).trim()) {
    case "Dumbbell":
      const targetPerDumbbell = targetWeight / 2;
      if (AVAILABLE_SINGLE_DUMBBELL_WEIGHTS.length > 0) {
        let closestSingle = AVAILABLE_SINGLE_DUMBBELL_WEIGHTS.reduce((prev, curr) =>
          (Math.abs(curr - targetPerDumbbell) < Math.abs(prev - targetPerDumbbell) ? curr : prev)
        );
        adjustedWeight = closestSingle * 2;
      }
      break;
    case "Barbell":
      if (AVAILABLE_TOTAL_BARBELL_WEIGHTS.length > 0) {
        if (targetWeight < AVAILABLE_TOTAL_BARBELL_WEIGHTS[0])
          adjustedWeight = AVAILABLE_TOTAL_BARBELL_WEIGHTS[0];
        else adjustedWeight = AVAILABLE_TOTAL_BARBELL_WEIGHTS.reduce((prev, curr) =>
          (Math.abs(curr - targetWeight) < Math.abs(prev - targetWeight) ? curr : prev));
      }
      break;
    case "EZBar":
      let weightOnEzBar = targetWeight - EZ_BAR_WEIGHT;
      if (weightOnEzBar < 0) weightOnEzBar = 0;
      let roundedPlateWeightEz = Math.round(weightOnEzBar / 5) * 5;
      adjustedWeight = EZ_BAR_WEIGHT + roundedPlateWeightEz;
      if (adjustedWeight < EZ_BAR_WEIGHT) adjustedWeight = EZ_BAR_WEIGHT;
      break;
    case "WeightedPullup":
      adjustedWeight = (targetWeight > 0) ? Math.round(targetWeight / 2.5) * 2.5 : 0;
      break;
    case "Machine - Plate Loaded": case "Machine - Stack":
      adjustedWeight = Math.round(targetWeight / 2.5) * 2.5;
      if (adjustedWeight < 0) adjustedWeight = 0;
      break;
    case "Bodyweight": adjustedWeight = 0; break;
  }
  return { adjustedWeight: Math.max(0, adjustedWeight), originalWeight: targetWeight };
}


function getWorkoutDetailsForTemplate(templateId) {
  userId = "davidrusho"
  try {
    const sheets = getAppSheets();
    const { data: telData, headerMap: telHeaderMap } =
      getSheetDataWithHeadersAndMap(sheets.templateExerciseListSheet, "templateExerciseListData");
    const { data: pmsData, headerMap: pmsHeaderMap } =
      getSheetDataWithHeadersAndMap(sheets.progressionModelStepsSheet, "progressionModelStepsData");
    const { data: elData, headerMap: elHeaderMap } =
      getSheetDataWithHeadersAndMap(sheets.exerciseLibrarySheet, "exerciseLibraryData");
    const { data: workoutLogData, headerMap: workoutLogHeaderMap, headers: workoutLogHeaders } =
      getSheetDataWithHeadersAndMap(sheets.workoutLogSheet, "workoutLogData_singleUser");

    const { data: uepData, headerMap: uepHeaderMap } =
      getSheetDataWithHeadersAndMap(sheets.userExerciseProgressionSheet, "userExerciseProgressionData");

    const exercisesInTemplate = telData
      .filter(row => row[telHeaderMap.TemplateID] === templateId)
      .sort((a, b) => (parseFloat(a[telHeaderMap.OrderInWorkout]) || 0) - (parseFloat(b[telHeaderMap.OrderInWorkout]) || 0));

    const workoutPlan = [];
    const today = new Date();
    // Use default locale for date string comparison
    const todayDateString = today.toLocaleDateString();
    Logger.log(`   Comparing against today's date: ${todayDateString} (using default server locale)`);


    for (const telRow of exercisesInTemplate) {
      const exerciseId = telRow[telHeaderMap.ExerciseID];
      const progressionModelId = telRow[telHeaderMap.ProgressionModelID];
      const notesForExerciseInTemplate = telRow[telHeaderMap.NotesForExerciseInTemplate] || "";

      const exerciseLibraryRow = findRowInDataByCriteria(elData, elHeaderMap, { ExerciseID: exerciseId });
      const equipmentType = exerciseLibraryRow && elHeaderMap.EquipmentType !==
        undefined ? String(exerciseLibraryRow[elHeaderMap.EquipmentType]).trim() : "Other";

      let actualStepToDisplay = 1; // Default to step 1
      let currentCycle1RMEstForExercise = 0; // Default
      let userMaxRepsForExercise = 0; // Default

      const userProgressionRow = findRowInDataByCriteria(uepData, uepHeaderMap, {
        UserID: userId,
        TemplateID: templateId,
        ExerciseID: exerciseId,
        ProgressionModelID: progressionModelId
      });

      if (userProgressionRow) {
        actualStepToDisplay = parseInt(userProgressionRow[uepHeaderMap.CurrentStepNumber]) || 1;
        currentCycle1RMEstForExercise = parseFloat(userProgressionRow[uepHeaderMap.CurrentCycle1RMEstimate]) || 0;

        Logger.log(`   Found UEP for ExID ${exerciseId}: Step ${actualStepToDisplay}, 1RM Est ${currentCycle1RMEstForExercise}`);
      } else {
        Logger.log(`   No UEP found for User ${userId}, ExID ${exerciseId}, Tpl ${templateId}. Defaulting to Step 1.`);
        // If no UEP entry, estimate initial 1RM or set to 0 for display purposes
        currentCycle1RMEstForExercise = estimateInitial1RM(exerciseId, sheets.workoutLogSheet, workoutLogHeaders, elData, elHeaderMap);
      }

      if (!exerciseId || !progressionModelId) {
        Logger.log(`      Skipping EID: ${exerciseId} due to missing ExerciseID or ProgressionModelID.`);
        workoutPlan.push({
          exerciseId: exerciseId || "N/A",
          exerciseName: exerciseLibraryRow ? exerciseLibraryRow[elHeaderMap.ExerciseName] : `Exercise ${exerciseId || "Unknown"}`,
          exerciseAlias: exerciseLibraryRow ? exerciseLibraryRow[elHeaderMap.ExerciseAlias] : null,
          calculatedSets: "-", calculatedReps: "-", calculatedWeight: "-", weightUnit: "lbs",
          currentStepNumber: actualStepToDisplay,
          stepNotes: "Missing ExerciseID or Progression Model assignment.",
          notesForExerciseInTemplate: notesForExerciseInTemplate,
          isLoggedToday: false,
          equipmentType: equipmentType,
          rawCalculatedWeight: "0.00"
        });
        continue;
      }

      const context = {};
      let isBodyweightMaxRepsModel = false;

      const tempStepDetailRowForModelCheck = pmsData.find(step =>
        String(step[pmsHeaderMap.ProgressionModelID]).trim() === progressionModelId &&
        parseInt(step[pmsHeaderMap.StepNumber]) === actualStepToDisplay
      )

      if (tempStepDetailRowForModelCheck &&
        tempStepDetailRowForModelCheck[pmsHeaderMap.TargetRepsFormula] && // Check if formula exists
        String(tempStepDetailRowForModelCheck[pmsHeaderMap.TargetRepsFormula]).includes("UserMaxReps")) {
        isBodyweightMaxRepsModel = true;
      }


      if (isBodyweightMaxRepsModel) {
        userMaxRepsForExercise = userProgressionRow && userProgressionRow[uepHeaderMap.UserMaxReps] ?
          parseInt(userProgressionRow[uepHeaderMap.UserMaxReps])
          : estimateCurrentUserMaxReps(exerciseId, sheets.workoutLogSheet, workoutLogHeaders);
        context.UserMaxReps = userMaxRepsForExercise;
        context.CurrentCycle1RMEstimate = 0;
        currentCycle1RMEstForExercise = userMaxRepsForExercise;
      } else {
        // For 1RM-based models, use the estimate from UEP or initial estimate
        context.CurrentCycle1RMEstimate = currentCycle1RMEstForExercise;
      }

      const exerciseSpecificMinReps = telRow[telHeaderMap.ExerciseSpecificMinReps];
      if (exerciseSpecificMinReps) context.ExerciseSpecificMinReps = parseInt(exerciseSpecificMinReps);

      // Use 'actualStepToDisplay' determined above
      const stepDetailRow = pmsData.find(step =>
        String(step[pmsHeaderMap.ProgressionModelID]).trim() === progressionModelId &&
        parseInt(step[pmsHeaderMap.StepNumber]) === actualStepToDisplay
      );

      if (!stepDetailRow) {
        Logger.log(`      Warning: ProgressionModelStep not found for EID:${exerciseId}, ModelID:"${progressionModelId}", Step:"${actualStepToDisplay}".`);
        workoutPlan.push({
          exerciseId,
          exerciseName: exerciseLibraryRow ? exerciseLibraryRow[elHeaderMap.ExerciseName] : `Exercise ${exerciseId}`,
          exerciseAlias: exerciseLibraryRow ? exerciseLibraryRow[elHeaderMap.ExerciseAlias] : null,
          calculatedSets: "-", calculatedReps: "-", calculatedWeight: "-", weightUnit: "lbs",
          currentStepNumber: actualStepToDisplay,
          stepNotes: "Progression step details undefined for this model and user's current step.",
          notesForExerciseInTemplate: notesForExerciseInTemplate,
          isLoggedToday: false,
          equipmentType: equipmentType,
          rawCalculatedWeight: "0.00"
        });
        continue;
      }

      const targetSetsFormula = stepDetailRow[pmsHeaderMap.TargetSetsFormula];
      const targetRepsFormula = stepDetailRow[pmsHeaderMap.TargetRepsFormula];
      const targetWeightFormula = stepDetailRow[pmsHeaderMap.TargetWeightFormula];
      const stepNotes = stepDetailRow[pmsHeaderMap.StepNotes] || "";

      const calculatedSets = resolveFormulaString(targetSetsFormula, context);
      const calculatedReps = resolveFormulaString(targetRepsFormula, context);
      let rawCalculatedWeightValue = resolveFormulaString(targetWeightFormula, context);

      let finalRoundedWeight;
      let rawWeightForDisplay;

      if (typeof rawCalculatedWeightValue === 'string' && isNaN(parseFloat(rawCalculatedWeightValue))) {
        finalRoundedWeight = rawCalculatedWeightValue;
        rawWeightForDisplay = rawCalculatedWeightValue;
      } else {
        const numericRawWeight = parseFloat(rawCalculatedWeightValue);
        if (isNaN(numericRawWeight)) {
          finalRoundedWeight = "0.00";
          rawWeightForDisplay = "0.00";
        } else {
          const adjustmentResult = adjustWeightToAvailableIncrements(numericRawWeight, equipmentType);
          finalRoundedWeight = adjustmentResult.adjustedWeight.toFixed(2);
          rawWeightForDisplay = adjustmentResult.originalWeight.toFixed(2);
        }
      }

      const exerciseName = exerciseLibraryRow ? exerciseLibraryRow[elHeaderMap.ExerciseName] : "Unknown Exercise";
      const exerciseAlias = exerciseLibraryRow ? exerciseLibraryRow[elHeaderMap.ExerciseAlias] : null;
      const weightUnit = exerciseLibraryRow ? exerciseLibraryRow[elHeaderMap.UnitOfMeasurement] : "lbs";

      let isLoggedToday = false;
      if (workoutLogHeaderMap.ExerciseID !== undefined && workoutLogHeaderMap.LinkedTemplateID !==
        undefined && workoutLogHeaderMap.ExerciseTimestamp !== undefined) {
        isLoggedToday = workoutLogData.some(logRow => {
          const rawLogTimestampValue = logRow[workoutLogHeaderMap.ExerciseTimestamp];
          let logDate; // This will hold the Date object

          if (rawLogTimestampValue instanceof Date) {
            logDate = rawLogTimestampValue;
          } else if (typeof rawLogTimestampValue === 'string') {
            logDate = new Date(rawLogTimestampValue); // Attempt to parse the string
            // Check if parsing resulted in a valid date
            if (isNaN(logDate.getTime())) {
              Logger.log(`      EID:${exerciseId} - Failed to parse date string from log: ${rawLogTimestampValue}`);
              return false; // Invalid date string, cannot compare
            }
          } else {
            // If it's not a Date and not a string, or if it's null/undefined
            if (rawLogTimestampValue) { // Log only if there's some unexpected value
              Logger.log(`      EID:${exerciseId} - Invalid type or empty ExerciseTimestamp in log: ${rawLogTimestampValue} (Type: ${typeof rawLogTimestampValue})`);
            }
            return false; // Cannot determine the date
          }

          // Now, logDate should be a valid Date object if the original value was usable
          const logDateString = logDate.toLocaleDateString();
          const match = logRow[workoutLogHeaderMap.ExerciseID] === exerciseId &&
            logRow[workoutLogHeaderMap.LinkedTemplateID] === templateId &&
            logDateString === todayDateString;
          return match;
        });
      }

      workoutPlan.push({
        exerciseId: exerciseId,
        exerciseName: exerciseName,
        exerciseAlias: exerciseAlias,
        orderInWorkout: telRow[telHeaderMap.OrderInWorkout],
        calculatedSets: calculatedSets,
        calculatedReps: calculatedReps,
        rawCalculatedWeight: rawWeightForDisplay,
        calculatedWeight: finalRoundedWeight,
        weightUnit: weightUnit,
        currentStepNumber: actualStepToDisplay,
        progressionModelId: progressionModelId,
        baseWeight: isBodyweightMaxRepsModel ? userMaxRepsForExercise : currentCycle1RMEstForExercise,
        isBodyweightMaxRepsModel: isBodyweightMaxRepsModel,
        equipmentType: equipmentType,
        stepNotes: stepNotes,
        notesForExerciseInTemplate: notesForExerciseInTemplate,
        isLoggedToday: isLoggedToday
      });
    }
    return workoutPlan;
  } catch (error) {
    Logger.log(`Error in getWorkoutDetailsForTemplate: ${error.message} (Stack: ${error.stack || 'N/A'})`);
    throw new Error(`Failed to get workout details: ${error.message}`);
  }
}


function estimateInitial1RM(exerciseId, workoutLogSheet, logHeaders, elData, elHeaderMap) {
  try {
    const logHeaderMap = createHeaderMap(logHeaders);
    if (!logHeaders || logHeaders.length === 0 || logHeaderMap["ExerciseID"] === undefined) return 0;
    const repsPerformedHeaderKey = logHeaders.find(h => h.toLowerCase().includes("repsperformed")) || "RepsPerformed (per set)";
    const essentialLogKeys = {
      ExerciseID: "ExerciseID",
      WeightUsed: "WeightUsed",
      RepsPerformed: repsPerformedHeaderKey,
      ExerciseTimestamp: "ExerciseTimestamp"
    };
    for (const keyName in essentialLogKeys) if (logHeaderMap[essentialLogKeys[keyName]] === undefined) return 0;

    const { data: logData } = getSheetDataWithHeadersAndMap(workoutLogSheet, `workoutLogData_singleUser`);
    const relevantEntries = logData
      .filter(row =>
        row[logHeaderMap[essentialLogKeys.ExerciseID]] === exerciseId &&
        parseFloat(row[logHeaderMap[essentialLogKeys.WeightUsed]]) > 0 &&
        parseInt(row[logHeaderMap[essentialLogKeys.RepsPerformed]]) > 0
      )
      .sort((a, b) => new Date(
        b[logHeaderMap[essentialLogKeys.ExerciseTimestamp]]) -
        new Date(a[logHeaderMap[essentialLogKeys.ExerciseTimestamp]]
        )
      );

    if (relevantEntries.length > 0) {
      const latestEntry = relevantEntries[0];
      const weight = parseFloat(latestEntry[logHeaderMap[essentialLogKeys.WeightUsed]]);
      const reps = parseInt(latestEntry[logHeaderMap[essentialLogKeys.RepsPerformed]]);
      if (isNaN(reps)) return 0;
      if (reps === 1) return weight;
      const estimated1RM = weight * (1 + reps / 30);
      return parseFloat(estimated1RM.toFixed(2));
    }
  } catch (e) { Logger.log(`   Error during estimateInitial1RM for ${exerciseId}: ${e.message}`); }

  const exerciseInfoForFallback = findRowInDataByCriteria(elData, elHeaderMap, { ExerciseID: exerciseId });
  if (exerciseInfoForFallback && elHeaderMap.Category !== undefined
    && String(exerciseInfoForFallback[elHeaderMap.Category]).toLowerCase().includes("bodyweight")) return 0;
  return 0;
}

function estimateCurrentUserMaxReps(exerciseId, workoutLogSheet, logHeaders) {
  try {
    const logHeaderMap = createHeaderMap(logHeaders);
    if (!logHeaders || logHeaders.length === 0 || logHeaderMap["ExerciseID"] === undefined) return 10;

    const repsPerformedHeaderKey =
      logHeaders.find(h => h.toLowerCase().includes("repsperformed")) || "RepsPerformed (per set)";
    const essentialKeys = ["ExerciseID", repsPerformedHeaderKey, "WeightUsed", "ExerciseTimestamp"];
    for (const k of essentialKeys) if (logHeaderMap[k] === undefined) return 10;

    const { data: logData } = getSheetDataWithHeadersAndMap(workoutLogSheet, `workoutLogData_singleUser`);
    let maxRepsFound = 0;
    logData.forEach(row => {
      if (row[logHeaderMap.ExerciseID] === exerciseId &&
        (parseFloat(row[logHeaderMap.WeightUsed]) === 0 || row[logHeaderMap.WeightUsed] === "" || row[logHeaderMap.WeightUsed] === null)) {
        const reps = parseInt(row[logHeaderMap[repsPerformedHeaderKey]]);
        if (!isNaN(reps) && reps > maxRepsFound) maxRepsFound = reps;
      }
    });
    if (maxRepsFound > 0) return maxRepsFound;
  } catch (e) { Logger.log(`   Error in estimateCurrentUserMaxReps for E:${exerciseId}: ${e.message}`); }
  return 10;
}


function resolveFormulaString(formulaString, context) {
  if (formulaString === null || formulaString === undefined) return "";
  let str = String(formulaString).trim();

  if (str.toUpperCase() === "AMRAP") return "AMRAP";
  if (!isNaN(parseFloat(str)) && isFinite(str)) return parseFloat(str);

  const RMEstimate = context.CurrentCycle1RMEstimate !==
    undefined ? parseFloat(context.CurrentCycle1RMEstimate) : NaN;
  const minReps = context.ExerciseSpecificMinReps !==
    undefined && context.ExerciseSpecificMinReps !== null ? parseInt(context.ExerciseSpecificMinReps) : NaN;
  const userMaxReps = context.UserMaxReps !== undefined ? parseInt(context.UserMaxReps) : NaN;

  if (isNaN(RMEstimate) && str.toLowerCase().includes("currentcycle1rmestimate")) return 0;
  if (isNaN(userMaxReps) && str.toLowerCase().includes("usermaxreps")) {
    if (str.startsWith("max(1,")) return 1;
    return formulaString;
  }

  let match;
  match = str.match(/max\s*\(\s*([0-9]+)\s*,\s*round\s*\(\s*UserMaxReps\s*\*\s*([0-9\.]+)\s*\)\s*\)/i);
  if (match && !isNaN(userMaxReps)) {
    const num1 = parseInt(match[1]); const factor = parseFloat(match[2]);
    if (!isNaN(num1) && !isNaN(factor)) return Math.max(num1, Math.round(userMaxReps * factor));
  }
  match = str.match(/round\s*\(\s*UserMaxReps\s*\*\s*([0-9\.]+)\s*\)/i);
  if (match && !isNaN(userMaxReps)) {
    const factor = parseFloat(match[1]);
    if (!isNaN(factor)) return Math.round(userMaxReps * factor);
  }

  match = str.match(/\(\s*\(\s*CurrentCycle1RMEstimate\s*\*\s*([0-9\.]+)\s*\)\s*\*\s*\(\s*1\s*([\+\-])\s*AMRAPRepsAtStep8\s*\/\s*([0-9\.]+)\s*\)\s*\)/i);
  if (match && !isNaN(RMEstimate)) {
    const factor1 = parseFloat(match[1]); const operation = match[2].trim();
    const amrapRepsVal = context.AMRAPRepsAtStep8; const factor2 = parseFloat(match[3]);
    if (amrapRepsVal !== undefined && !isNaN(parseInt(amrapRepsVal))) {
      const amrapReps = parseInt(amrapRepsVal);
      if (!isNaN(amrapReps) && !isNaN(factor1) && !isNaN(factor2) && factor2 !== 0) {
        if (operation === "+") return (RMEstimate * factor1) * (1 + amrapReps / factor2);
        else if (operation === "-") return (RMEstimate * factor1) * (1 - amrapReps / factor2);
      }
    } else if (str.includes("AMRAPRepsAtStep8")) return `Calculated based on AMRAP performance`;
    else return RMEstimate * factor1;
  }

  match = str.match(/^\(\s*CurrentCycle1RMEstimate\s*\*\s*([0-9\.]+)\s*\)$/i);
  if (match && !isNaN(RMEstimate)) return RMEstimate * parseFloat(match[1]);

  match = str.match(/^CurrentCycle1RMEstimate\s*\*\s*([0-9\.]+)$/i);
  if (match && !isNaN(RMEstimate)) return RMEstimate * parseFloat(match[1]);

  match = str.match(/^currentCycleBaseWeight\s*\+\s*([0-9\.]+)\s*(lbs|kg)?$/i);
  if (match && !isNaN(RMEstimate)) return RMEstimate + parseFloat(match[1]);

  match = str.match(/^minReps\s*\+\s*([0-9]+)$/i);
  if (match && !isNaN(minReps)) return minReps + parseInt(match[1]);

  if (str.toLowerCase() === 'minreps' && !isNaN(minReps)) return minReps;

  return formulaString;
}

function processLogForm(formData) {
  Logger.log(`>>> processLogForm. FormData: ${JSON.stringify(formData)}`);
  try {
    const sheets = getAppSheets();
    const requiredFields = [
      'templateId',
      'exerciseId',
      'progressionModelId',
      'performedStepNumber',
      'setsPerformed',
      'repsPerformed',
      'weightUsed',
      'rpe'
    ];
    for (const field of requiredFields) {
      if (formData[field] === undefined || formData[field] === null || String(formData[field]).trim() === "") {
        if (field === 'actualAmrapReps' && String(formData.repsPerformed).toUpperCase() !== "AMRAP") continue;
        throw new Error(`Missing required form data field: ${field}.`);
      }
    }

    const setsPerformed = parseInt(formData.setsPerformed);
    const repsPerformedDisplay = String(formData.repsPerformed).toUpperCase();
    const weightUsed = parseFloat(formData.weightUsed);
    const rpeLogged = parseInt(formData.rpe);
    let actualAmrapReps = null;
    let numericRepsFor1RMEst = null;

    if (repsPerformedDisplay === "AMRAP") {
      actualAmrapReps = parseInt(formData.actualAmrapReps);
      if (isNaN(actualAmrapReps) || actualAmrapReps < 0) throw new Error("Invalid 'Actual AMRAP Reps'.");
      numericRepsFor1RMEst = actualAmrapReps;
    } else {
      const parsedReps = parseInt(formData.repsPerformed);
      if (isNaN(parsedReps) || parsedReps < 0) throw new Error("Invalid 'Reps Performed'.");
      numericRepsFor1RMEst = parsedReps;
    }

    if (isNaN(setsPerformed) || setsPerformed <= 0) throw new Error("Invalid 'Sets Performed'.");
    if (isNaN(weightUsed) || weightUsed < 0) throw new Error("Invalid 'Weight Used'.");
    if (isNaN(rpeLogged) || rpeLogged < 0 || rpeLogged > 10) throw new Error("Invalid 'RPE'.");

    let estimated1RMForSet = 0;
    if (weightUsed >= 0 && numericRepsFor1RMEst > 0) {
      if (numericRepsFor1RMEst === 1) estimated1RMForSet = weightUsed;
      else estimated1RMForSet = weightUsed * (1 + numericRepsFor1RMEst / 30);
      estimated1RMForSet = parseFloat(estimated1RMForSet.toFixed(2));
    } else if (weightUsed === 0 && numericRepsFor1RMEst > 0) estimated1RMForSet = 0;

    const workoutLogHeaders = getHeaders(sheets.workoutLogSheet);
    const logEntry = {};
    workoutLogHeaders.forEach(header => {
      logEntry[header] = null;
      if (header === "LogID") logEntry[header] = `WLOG_${Utilities.getUuid()}`;
      else if (header === "ExerciseTimestamp") logEntry[header] = new Date();
      else if (header === "ExerciseID") logEntry[header] = formData.exerciseId;
      else if (header === "TotalSetsPerformed") logEntry[header] = setsPerformed;
      else if (header === "RepsPerformed (per set)") logEntry[header] = repsPerformedDisplay;
      else if (header === "WeightUsed") logEntry[header] = weightUsed;
      else if (header === "Estimated 1RM") logEntry[header] = estimated1RMForSet;
      else if (header === "WeightUnit") logEntry[header] = formData.weightUnit || "lbs";
      else if (header === "RPE_Recorded") logEntry[header] = rpeLogged;
      else if (header === "WorkoutNotes") logEntry[header] = formData.notes || null;
      else if (header === "LinkedTemplateID") logEntry[header] = formData.templateId;
      else if (header === "LinkedProgressionModelID") logEntry[header] = formData.progressionModelId;
      else if (header === "PerformedAtStepNumber") logEntry[header] = parseInt(formData.performedStepNumber);
      else if (header === "LastModified") logEntry[header] = new Date();
    });

    logWorkoutEntryToSheet(logEntry, sheets.workoutLogSheet, workoutLogHeaders);
    SCRIPT_CACHE.remove(`workoutLogData_singleUser`);

    const userId = "davidrusho"; // Assuming single user for now as per MD file
    updateUserProgressionAfterLog(
      userId,
      formData.templateId,
      formData.exerciseId,
      formData.progressionModelId,
      parseInt(formData.performedStepNumber),
      parseInt(formData.rpe),
      formData.repsPerformed, // To check if it was AMRAP
      formData.actualAmrapReps ? parseInt(formData.actualAmrapReps) : null,
      sheets // Pass all sheets for convenience
    );

    return {
      message: `${formData.exerciseName || formData.exerciseId} logged successfully!`,
      loggedData: {
        name: formData.exerciseName || formData.exerciseId,
        sets: setsPerformed,
        reps: repsPerformedDisplay,
        weight: weightUsed,
        rpe: rpeLogged,
        weightUnit: formData.weightUnit || 'lbs',
        notes: formData.notes || ""
      }
    };
  } catch (error) {
    Logger.log(`ERROR in processLogForm: ${error.message} (Stack: ${error.stack || 'N/A'})`);
    throw new Error(`Failed to process log: ${error.message}`);
  }
}

function updateUserProgressionAfterLog(
  userId,
  templateId,
  exerciseId,
  progressionModelId,
  performedStepNumber,
  loggedRPE,
  repsPerformedDisplay,
  actualAmrapReps,
  appSheets
) {
  Logger.log(`>>> updateUserProgressionAfterLog: User:${userId}, Tpl:${templateId}, Ex:${exerciseId}, Model:${progressionModelId}, Step:${performedStepNumber}, RPE:${loggedRPE}, AMRAP Reps: ${actualAmrapReps}`);

  try {
    const {
      userExerciseProgressionSheet,
      progressionModelsSheet,
      progressionModelStepsSheet,
      exerciseLibrarySheet // For getting exercise details if needed for 1RM estimates
    } = appSheets;

    // Get data with headers
    const { data: uepData, headerMap: uepHeaderMap, headers: uepHeaders } =
      getSheetDataWithHeadersAndMap(userExerciseProgressionSheet, "userExerciseProgressionData");
    const { data: pmData, headerMap: pmHeaderMap } =
      getSheetDataWithHeadersAndMap(progressionModelsSheet, "progressionModelsData");
    const { data: pmsData, headerMap: pmsHeaderMap } =
      getSheetDataWithHeadersAndMap(progressionModelStepsSheet, "progressionModelStepsData");
    const { data: elData, headerMap: elHeaderMap } =
      getSheetDataWithHeadersAndMap(exerciseLibrarySheet, "exerciseLibraryData");


    // Find the specific progression model details
    const modelInfo = findRowInDataByCriteria(pmData, pmHeaderMap, { ProgressionModelID: progressionModelId });
    if (!modelInfo) {
      Logger.log(`   Progression model ${progressionModelId} not found.`);
      return; // Or throw error
    }

    const triggerLogic = String(modelInfo[pmHeaderMap.TriggerConditionLogic]).trim();
    const cycleCompletionLogicStr = String(modelInfo[pmHeaderMap.CycleCompletionConditionLogic]).trim();
    const newCycleBaseWeightFormula = modelInfo[pmHeaderMap.NewCycleBaseWeightFormula];
    const defaultTotalSteps = parseInt(modelInfo[pmHeaderMap.DefaultTotalSteps]);

    // Find existing user progression or prepare a new one
    let userProgRowIndex = uepData.findIndex(row =>
      row[uepHeaderMap.UserID] === userId &&
      row[uepHeaderMap.TemplateID] === templateId &&
      row[uepHeaderMap.ExerciseID] === exerciseId &&
      row[uepHeaderMap.ProgressionModelID] === progressionModelId
    );

    let currentUepData;
    let isNewEntry = false;

    if (userProgRowIndex !== -1) {
      currentUepData = {};
      uepHeaders.forEach((header, index) => currentUepData[header] = uepData[userProgRowIndex][index]);
    } else {
      // If no entry, create a new one (assuming starting at step 1)
      let initial1RMEst = 0;
      // Simplified: a more robust solution would check if model is for BW max reps or 1RM
      const exerciseDetails = findRowInDataByCriteria(elData, elHeaderMap, { ExerciseID: exerciseId });
      const isBodyweightExercise = exerciseDetails && String(exerciseDetails[elHeaderMap.Category]).toLowerCase().includes("bodyweight");

      if (!isBodyweightExercise) {
        // Use existing 1RM estimation logic or default
        initial1RMEst = estimateInitial1RM(exerciseId, appSheets.workoutLogSheet, getHeaders(appSheets.workoutLogSheet), elData, elHeaderMap) || 0;
        Logger.log(`   New UEP entry for ${exerciseId}. Initial 1RM estimated: ${initial1RMEst}`);
      } else {
        // For bodyweight, it might be max reps. This needs to align with how PM_BW_MaxRepsPct_001 works.
        initial1RMEst = 0; // Or current max reps if applicable.
        Logger.log(`   New UEP entry for BW exercise ${exerciseId}. Initial base value (e.g. max reps) might need to be set.`);
      }


      currentUepData = {
        UserExerciseProgressionID: `UEP_${Utilities.getUuid()}`,
        UserID: userId,
        TemplateID: templateId,
        ExerciseID: exerciseId,
        ProgressionModelID: progressionModelId,
        CurrentStepNumber: 1, // Start at step 1
        CurrentCycle1RMEstimate: initial1RMEst,
        LastWorkoutRPE: null,
        AMRAPRepsAtStep8: null, // Or whatever the AMRAP step is
        DateOfLastAttempt: new Date(),
        CycleStartDate: new Date()
      };
      isNewEntry = true;
      Logger.log(`   No existing UserExerciseProgression found for ${exerciseId}. Creating new entry.`);
    }

    let meetsTriggerCondition = false;
    if (triggerLogic.toLowerCase() === "loggedrpe <= 8" && loggedRPE <= 8) {
      meetsTriggerCondition = true;
    } else if (triggerLogic.toLowerCase() === "loggedrpe < 9" && loggedRPE < 9) { // Example alternative
      meetsTriggerCondition = true;
    }
    // Add more complex trigger logic parsing if needed

    Logger.log(`   Meets Trigger Condition (${triggerLogic}): ${meetsTriggerCondition} (Logged RPE: ${loggedRPE})`);

    if (meetsTriggerCondition) {
      let nextStepNumber = parseInt(currentUepData.CurrentStepNumber); // Ensure it's a number

      // Check if the *performed* step was the last step in the model
      if (performedStepNumber >= defaultTotalSteps) {
        let meetsCycleCompletion = false;
        if ((progressionModelId === "PM_8StepRPE_001" || progressionModelId === "PM_8StepRPE_002") &&
          performedStepNumber === 8 && loggedRPE <= 8 && actualAmrapReps > 0) {
          meetsCycleCompletion = true;
        } else if (progressionModelId === "PM_BW_MaxRepsPct_001" &&
          performedStepNumber === 3 && loggedRPE <= 8) {
          // Bodyweight model might have different logic, e.g., prompt retest
          meetsCycleCompletion = true; // Simplified
          Logger.log("   Bodyweight Max Reps cycle complete. Should prompt re-test and update max reps.");

        }


        Logger.log(`   Cycle Completion Check (PerformedStep: ${performedStepNumber}, TotalSteps: ${defaultTotalSteps}, AMRAP: ${actualAmrapReps}). Meets: ${meetsCycleCompletion}`);

        if (meetsCycleCompletion) {
          // Cycle Complete: Reset to step 1 and update 1RM/Base Weight
          nextStepNumber = 1;
          currentUepData.AMRAPRepsAtStep8 = actualAmrapReps; // Store the AMRAP reps

          if (newCycleBaseWeightFormula && (progressionModelId === "PM_8StepRPE_001" || progressionModelId === "PM_8StepRPE_002")) {
            const context = {
              CurrentCycle1RMEstimate: parseFloat(currentUepData.CurrentCycle1RMEstimate),
              AMRAPRepsAtStep8: actualAmrapReps
            };
            const new1RMEst = resolveFormulaString(newCycleBaseWeightFormula, context);
            const numericNew1RMEst = parseFloat(new1RMEst);
            if (!isNaN(numericNew1RMEst) && numericNew1RMEst > 0) {
              currentUepData.CurrentCycle1RMEstimate = numericNew1RMEst.toFixed(2);
              Logger.log(`   Cycle Complete! New 1RM Estimate: ${currentUepData.CurrentCycle1RMEstimate}`);
            } else {
              Logger.log(`   Warning: NewCycleBaseWeightFormula "${newCycleBaseWeightFormula}" did not resolve to a valid number: ${new1RMEst}. 1RM not updated.`);
            }
          } else if (progressionModelId === "PM_BW_MaxRepsPct_001") {

            Logger.log(`   Bodyweight model cycle complete. UserMaxReps update logic needed separately.`);
          }
          currentUepData.CycleStartDate = new Date(); // Reset cycle start date
        } else {

          if (performedStepNumber >= defaultTotalSteps && !meetsCycleCompletion) {
            nextStepNumber = performedStepNumber; // Stay on the same (last) step if condition met but not cycle completion logic
            Logger.log(`   RPE condition met on last step (${performedStepNumber}), but cycle completion not fully triggered. Staying on step.`);
          } else {
            nextStepNumber = performedStepNumber + 1; // Standard increment if not the last step
          }
        }
      } else {
        // Not the last step, just increment
        nextStepNumber = performedStepNumber + 1;
      }
      currentUepData.CurrentStepNumber = nextStepNumber;
      Logger.log(`   Advanced to Step: ${currentUepData.CurrentStepNumber}`);
    } else {
      // RPE condition not met, stay on the same step
      currentUepData.CurrentStepNumber = performedStepNumber; // Stay on the step they just performed
      Logger.log(`   RPE condition not met. Staying on Step: ${currentUepData.CurrentStepNumber}`);
    }

    currentUepData.LastWorkoutRPE = loggedRPE;
    currentUepData.DateOfLastAttempt = new Date();

    // Update the sheet
    if (isNewEntry) {
      const newRowValues = uepHeaders.map(header => currentUepData[header] !== undefined ? currentUepData[header] : null);
      userExerciseProgressionSheet.appendRow(newRowValues);
      Logger.log(`   Appended new UserExerciseProgression entry.`);
    } else {
      const rowToUpdate = userProgRowIndex + 2; // +1 for header, +1 for 0-based to 1-based index
      uepHeaders.forEach((header, colIndex) => {
        if (currentUepData[header] !== undefined) {
          userExerciseProgressionSheet.getRange(rowToUpdate, colIndex + 1).setValue(currentUepData[header]);
        }
      });
      Logger.log(`   Updated UserExerciseProgression entry at row ${rowToUpdate}.`);
    }

    SCRIPT_CACHE.remove("userExerciseProgressionData"); // Clear cache
    Logger.log("UserExerciseProgression updated and cache cleared.");

  } catch (error) {
    Logger.log(`ERROR in updateUserProgressionAfterLog: ${error.message} (Stack: ${error.stack || 'N/A'})`);
    // Decide if this error should propagate to the user or just be logged
  }
}


function logWorkoutEntryToSheet(logEntryObject, workoutLogSheet, headersArray) {
  const rowData = headersArray.map(header => logEntryObject[header] !== undefined ? logEntryObject[header] : null);
  workoutLogSheet.appendRow(rowData);
}

// --- Test Function Example (can be run from Apps Script Editor) ---
function testExerciseProgressionCycle(templateIdToTest, exerciseIdToTest, initialEstimateForCycle) {
  Logger.log(`\n--- testExerciseProgressionCycle ---`);
  Logger.log(`Template: ${templateIdToTest}, Exercise: ${exerciseIdToTest}, Initial Estimate: ${initialEstimateForCycle}`);

  if (!templateIdToTest || !exerciseIdToTest || initialEstimateForCycle === undefined || isNaN(parseFloat(initialEstimateForCycle))) {
    Logger.log("Usage: testExerciseProgressionCycle('YOUR_TEMPLATE_ID', 'YOUR_EXERCISE_ID', INITIAL_1RM_OR_MAX_REPS)");
    return;
  }
  const initialEstimate = parseFloat(initialEstimateForCycle);

  try {
    const sheets = getAppSheets();
    const { data: telData, headerMap: telHeaderMap } =
      getSheetDataWithHeadersAndMap(sheets.templateExerciseListSheet, "templateExerciseListData_test");
    const { data: pmsData, headerMap: pmsHeaderMap } =
      getSheetDataWithHeadersAndMap(sheets.progressionModelStepsSheet, "progressionModelStepsData_test");
    const { data: elData, headerMap: elHeaderMap } =
      getSheetDataWithHeadersAndMap(sheets.exerciseLibrarySheet, "exerciseLibraryData_test");

    const exerciseTemplateEntry = telData.find(row =>
      row[telHeaderMap.TemplateID] === templateIdToTest &&
      row[telHeaderMap.ExerciseID] === exerciseIdToTest
    );

    if (!exerciseTemplateEntry) {
      Logger.log(`Exercise ${exerciseIdToTest} not found in Template ${templateIdToTest}.`);
      return;
    }

    const progressionModelId = exerciseTemplateEntry[telHeaderMap.ProgressionModelID];
    if (!progressionModelId) {
      Logger.log(`ProgressionModelID not assigned to ${exerciseIdToTest} in Template ${templateIdToTest}.`);
      return;
    }
    Logger.log(`Using ProgressionModelID: ${progressionModelId}`);

    const exerciseLibraryEntry = findRowInDataByCriteria(elData, elHeaderMap, { ExerciseID: exerciseIdToTest });
    const displayName = (exerciseLibraryEntry && exerciseLibraryEntry[elHeaderMap.ExerciseAlias]) ?
      exerciseLibraryEntry[elHeaderMap.ExerciseAlias] : (exerciseLibraryEntry ?
        exerciseLibraryEntry[elHeaderMap.ExerciseName] : exerciseIdToTest);
    const weightUnit = exerciseLibraryEntry ? exerciseLibraryEntry[elHeaderMap.UnitOfMeasurement] : "lbs";
    const equipmentType = exerciseLibraryEntry ? (exerciseLibraryEntry[elHeaderMap.EquipmentType] || "Other") : "Other";


    const stepsForModel = pmsData
      .filter(step => step[pmsHeaderMap.ProgressionModelID] === progressionModelId)
      .sort((a, b) => parseInt(a[pmsHeaderMap.StepNumber]) - parseInt(b[pmsHeaderMap.StepNumber]));

    if (stepsForModel.length === 0) {
      Logger.log(`No steps found for ProgressionModelID: ${progressionModelId}`);
      return;
    }
    Logger.log(`Found ${stepsForModel.length} steps for model ${progressionModelId}.`);

    let currentSimulated1RMEst = initialEstimate;
    let currentSimulatedMaxReps = initialEstimate;

    stepsForModel.forEach(stepData => {
      const stepNumber = parseInt(stepData[pmsHeaderMap.StepNumber]);
      const targetSetsFormula = stepData[pmsHeaderMap.TargetSetsFormula];
      const targetRepsFormula = stepData[pmsHeaderMap.TargetRepsFormula];
      const targetWeightFormula = stepData[pmsHeaderMap.TargetWeightFormula];
      const stepNotes = stepData[pmsHeaderMap.StepNotes] || "";

      const context = {};
      let isBodyweightMaxRepsModelThisStep = String(targetRepsFormula).includes("UserMaxReps");

      if (isBodyweightMaxRepsModelThisStep) {
        context.UserMaxReps = currentSimulatedMaxReps;
        context.CurrentCycle1RMEstimate = 0;
      } else {
        context.CurrentCycle1RMEstimate = currentSimulated1RMEst;
      }

      const sets = resolveFormulaString(targetSetsFormula, context);
      const reps = resolveFormulaString(targetRepsFormula, context);
      let rawWeight = resolveFormulaString(targetWeightFormula, context);
      let finalWeight = parseFloat(rawWeight);

      if (!isNaN(finalWeight)) {
        const adjustment = adjustWeightToAvailableIncrements(finalWeight, equipmentType);
        finalWeight = adjustment.adjustedWeight.toFixed(2);
        rawWeight = adjustment.originalWeight.toFixed(2);
      } else {
        finalWeight = rawWeight;
      }

      Logger.log(`--- Step ${stepNumber} for ${displayName} (${progressionModelId}) ---`);
      if (isBodyweightMaxRepsModelThisStep) {
        Logger.log(`   (Using Max Reps: ${currentSimulatedMaxReps})`);
      } else {
        Logger.log(`   (Using 1RM Est: ${currentSimulated1RMEst} ${weightUnit})`);
      }
      Logger.log(`   Prescription: ${sets} sets x ${reps} reps @ ${finalWeight} ${isBodyweightMaxRepsModelThisStep || parseFloat(finalWeight) === 0 ? "" : weightUnit}`);
      if (stepNotes) Logger.log(`   Note: ${stepNotes}`);

      if (String(reps).toUpperCase() === "AMRAP" && (progressionModelId === "PM_8StepRPE_001" || progressionModelId === "PM_8StepRPE_002")) {
        const simulatedAmrapReps = 5;

        const { data: pmDataAll, headerMap: pmHeaderMapAll } = getSheetDataWithHeadersAndMap(sheets.progressionModelsSheet, "progressionModelsData_test_cycle");
        const modelDetails = findRowInDataByCriteria(pmDataAll, pmHeaderMapAll, { ProgressionModelID: progressionModelId });

        if (modelDetails && modelDetails[pmHeaderMapAll.NewCycleBaseWeightFormula]) {
          const new1RMEstContext = {
            CurrentCycle1RMEstimate: currentSimulated1RMEst,
            AMRAPRepsAtStep8: simulatedAmrapReps
          };
          const newEst1RM = resolveFormulaString(modelDetails[pmHeaderMapAll.NewCycleBaseWeightFormula], new1RMEstContext);
          const numericNewEst1RM = parseFloat(newEst1RM);
          if (!isNaN(numericNewEst1RM) && numericNewEst1RM > 0) {
            Logger.log(`   >>> Estimated 1RM for NEXT cycle based on this AMRAP: ${numericNewEst1RM.toFixed(2)} ${weightUnit}`);
          } else {
            Logger.log(`   >>> New 1RM formula for next cycle did not resolve to a valid number: ${newEst1RM}`);
          }
        }
      } else if (isBodyweightMaxRepsModelThisStep && String(reps).toUpperCase() === "AMRAP") {
        const simulatedNewMaxReps = Math.ceil(currentSimulatedMaxReps * 1.1);
        Logger.log(`   Simulating Bodyweight AMRAP. Assuming new Max Reps for NEXT cycle would be: ${simulatedNewMaxReps}`);
      }
    });
  } catch (e) {
    Logger.log("Error during testExerciseProgressionCycle: " + e.message + " Stack: " + e.stack);
  }
}


/**
 * Gets the last logged details for a specific exercise, optionally filtered by template.
 * @param {string} exerciseId The ID of the exercise.
 * @param {string} templateId The ID of the workout template (optional).
 * @return {object|null} An object with last log details or null if not found, or an error object.
 */
function getLastLoggedDetailsForExercise(exerciseId, templateId) {
  if (!exerciseId) {
    Logger.log("getLastLoggedDetailsForExercise: Exercise ID is required.");
    return null; 
  }

  try {
    const sheets = getAppSheets(); 

    // Use your existing getSheetDataWithHeadersAndMap which handles caching
    // Ensure "workoutLogData_singleUser" is the correct cache key you use for the WorkoutLog sheet
    const { data: workoutLogData, headerMap: logHeaderMap } =
      getSheetDataWithHeadersAndMap(sheets.workoutLogSheet, "workoutLogData_singleUser");

    // Validate that essential headers exist in the WorkoutLog sheet
    const requiredHeaders = ['ExerciseID', 'ExerciseTimestamp', 'TotalSetsPerformed', 'RepsPerformed (per set)', 'WeightUsed', 'RPE_Recorded'];
    for (const header of requiredHeaders) {
      if (logHeaderMap[header] === undefined && !(header === 'RepsPerformed (per set)' && logHeaderMap['RepsPerformed'])) { // Allow for slight variations in RepsPerformed header
        Logger.log(`WorkoutLog sheet is missing required header: ${header}`);
        return { error: `Log sheet data is incomplete. Missing: ${header}` };
      }
    }

    // Adjust header name for 'RepsPerformed (per set)' if needed, based on your actual sheet
    const repsPerformedHeader = logHeaderMap['RepsPerformed (per set)'] !== undefined ? 'RepsPerformed (per set)' : 'RepsPerformed';


    let relevantLogs = workoutLogData.filter(row => {
      const rowExerciseId = String(row[logHeaderMap.ExerciseID]).trim();
      let match = rowExerciseId === String(exerciseId).trim();

      // If templateId is provided and the LinkedTemplateID column exists, filter by it
      if (templateId && String(templateId).trim() !== "" && logHeaderMap.LinkedTemplateID !== undefined) {
        const rowTemplateId = String(row[logHeaderMap.LinkedTemplateID]).trim();
        match = match && (rowTemplateId === String(templateId).trim());
      }
      return match;
    });

    if (relevantLogs.length === 0) {
      return null; // No logs found for this exercise (and template, if specified)
    }

    // Sort by ExerciseTimestamp (descending - newest first)
    relevantLogs.sort((a, b) => {
      const dateA = new Date(a[logHeaderMap.ExerciseTimestamp]);
      const dateB = new Date(b[logHeaderMap.ExerciseTimestamp]);
      return dateB.getTime() - dateA.getTime(); // getTime() ensures correct date comparison
    });

    const lastLogEntry = relevantLogs[0];

    return {
      exerciseTimestamp: lastLogEntry[logHeaderMap.ExerciseTimestamp],
      setsPerformed: lastLogEntry[logHeaderMap.TotalSetsPerformed],
      repsPerformed: lastLogEntry[logHeaderMap[repsPerformedHeader]],
      weightUsed: lastLogEntry[logHeaderMap.WeightUsed],
      weightUnit: lastLogEntry[logHeaderMap.WeightUnit] || 'lbs', // Default to lbs if not specified
      rpeRecorded: lastLogEntry[logHeaderMap.RPE_Recorded],
      workoutNotes: lastLogEntry[logHeaderMap.WorkoutNotes] || "" // Default to empty string if not specified
    };

  } catch (e) {
    Logger.log(`Error in getLastLoggedDetailsForExercise (Exercise: ${exerciseId}, Template: ${templateId}): ${e.toString()} - Stack: ${e.stack}`);
    return { error: `Server error fetching last log details.` }; // Generic error to client
  }
}
