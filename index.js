const fetch = require("node-fetch");
require("dotenv").config();

/*
  - Per CC API Docs -> Payload cannot be > 4MB or contain > 20,000 email addresses
  - https://developer.constantcontact.com/docs/bulk_activities_api/bulk-activities-remove-contacts-api.html
  - Individual list ID's can be found via GET -> https://api.constantcontact.com/v2/lists?api_key=${API_KEY}
  - Script currently scheduled to run every: __3__ hours
*/

// GLOBAL VARIABLES
const URL = "https://api.constantcontact.com/v2";
const CURRENTS_LIST_ID = "1434673743";
const LEADS_LIST_ID = "1203581726";

// STEP 1. - POST request to create a new Bulk Activity for exporting a contact list to CSV format
const createExportActivity = async (listId) => {
  const opts = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      file_type: "CSV",
      sort_by: "EMAIL_ADDRESS",
      export_date_added: true,
      export_added_by: true,
      lists: [listId],
      column_names: ["Email"],
    }),
  };

  const response = await fetch(
    `https://api.constantcontact.com/v2/activities/exportcontacts?api_key=${process.env.API_KEY}`,
    opts
  );
  const data = await response.json();

  return data;
};

// STEP 2. - Check on the 'status' of the Activity request (Cannot receive CSV URL until 'status' === 'COMPLETE') - 15seconds to 15 minutes
const checkExportActivity = async (listId) => {
  const exportActivity = await createExportActivity(listId);
  let isExportComplete = await checkActivityStatus(exportActivity.id);

  // Check that CSV export activity status must be 'COMPLETE' before proceeding
  // Returns a Promise that resolves after timeDelay (10 seconds) -> Prevents breaking 10,000 Call / day limit during while loop
  const timeDelay = 1000 * 10;
  function timer(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  while (isExportComplete.status !== "COMPLETE") {
    isExportComplete = await checkActivityStatus(exportActivity.id);
    await timer(timeDelay); // Created Promise can be awaited -> Prevents breaking 10,000 call/day limit during while loop
  }

  return isExportComplete;
};

// STEP 3. - After Activity 'status' === 'COMPLETE' make GET request to CSV URL provided
const getCsvByUrl = async (listId) => {
  const opts = {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
    },
  };
  const contactList = [];
  const activityObject = await checkExportActivity(listId);
  const csvFileName = await activityObject.file_name;

  // Convert CSV file into an array with only email addresses to use in Step 4.
  const response = await fetch(
    `${csvFileName}?api_key=${process.env.API_KEY}`,
    opts
  );
  const data = await response.text();
  const dataObject = CSVToJSON(data);
  dataObject.slice(1, -1).map((data) => {
    contactList.push(data[0]);
  });

  return contactList;
};

/* STEP 4. 
  Get the contact list for Current Customers & Leads, 
  Map through both lists and push any duplicates into new array, this array will be used to bulk remove duplicates from Leads
*/
const compareLists = async () => {
  const currents = await getCsvByUrl(CURRENTS_LIST_ID);
  const leads = await getCsvByUrl(LEADS_LIST_ID);
  const duplicates = [];

  // Map through both "currents" & "leads" and add any matching contacts (by id) to the "duplicates" array
  currents.map((current) => {
    leads.map((lead) => {
      if (current === lead) duplicates.push({ email_addresses: [current] });
    });
  });

  // If emailAddresses.length > 0, run the "removeContactsEndpoints" function to delete duplicates from the Leads list
  if (duplicates.length > 0) {
    console.log(
      `${duplicates.length} duplicate contact(s) deleted on ${new Date()}`
    );
    duplicates.map((email) => console.log(`${email.email_addresses}`));
    removeContactsEndpoints(duplicates);
  }
};

// ********** SCRIPT SCHEDULE ********** //
compareLists();
// const delay = 1000 * 60 * 60 * 3;
// setInterval(() => {
//   compareLists();
//   console.log('Script Executed');
// }, delay);

// ********** FUNCTIONS ********** //
const removeContactsEndpoints = async (emailsArray) => {
  const opts = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      import_data: emailsArray,
      lists: [LEADS_LIST_ID],
    }),
  };
  const response = await fetch(
    `https://api.constantcontact.com/v2/activities/removefromlists?api_key=${process.env.API_KEY}`,
    opts
  );
  const data = response.json();
  return data;
};

const checkActivityStatus = async (activityId) => {
  const opts = {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
    },
  };

  const response = await fetch(
    `https://api.constantcontact.com/v2/activities/${activityId}?api_key=${process.env.API_KEY}`,
    opts
  );
  const data = response.json();
  return data;
};

// ********** CSV TO JSON FUNCTIONS ********** //
function CSVToJSON(csvData) {
  var data = CSVToArray(csvData);
  return data;
}

function CSVToArray(csvData, delimiter) {
  delimiter = delimiter || ",";
  var pattern = new RegExp(
    "(\\" +
      delimiter +
      "|\\r?\\n|\\r|^)" +
      '(?:"([^"]*(?:""[^"]*)*)"|' +
      '([^"\\' +
      delimiter +
      "\\r\\n]*))",
    "gi"
  );
  var data = [[]];
  var matches = null;
  while ((matches = pattern.exec(csvData))) {
    var matchedDelimiter = matches[1];
    if (matchedDelimiter.length && matchedDelimiter != delimiter) {
      data.push([]);
    }
    if (matches[2]) {
      var matchedDelimiter = matches[2].replace(new RegExp('""', "g"), '"');
    } else {
      var matchedDelimiter = matches[3];
    }
    data[data.length - 1].push(matchedDelimiter);
  }
  return data;
}
