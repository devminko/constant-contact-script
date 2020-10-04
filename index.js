const fetch = require('node-fetch');
const CronJob = require('cron').CronJob;
require('dotenv').config();

/*
  - Per CC API Docs -> Payload cannot be > 4MB or contain > 20,000 email addresses
  - https://developer.constantcontact.com/docs/bulk_activities_api/bulk-activities-remove-contacts-api.html
  - Individual list ID's can be found via GET -> https://api.constantcontact.com/v2/lists?api_key=${API_KEY}

  - Cron job currently scheduled to run every: __?__ hours
*/

// GLOBAL VARIABLES
const URL = "https://api.constantcontact.com/v2";
const CURRENT_CONTACTS_LIST_ID = "1922955767";
const LEADS_LIST_ID = "2144967563";

// ********** MAIN SCRIPT ********** //
const findAndDeleteDuplicates = async () => {
  let contacts = await fetchAllContacts();
  let currents = [];
  let leads = [];
  let duplicates = [];
  let emailAddresses = [];

  /* 
    Map through contacts, if contacts.lists.length > 1 (allows for a contact to be in both lists),
    Filter and push Current_List id & Leads_List id to "currents" & "leads" arrays
  */
  await contacts.results.map(contact => {
    if (contact.lists.length > 1) {
      if (contact.lists.some(list => list.id === CURRENT_CONTACTS_LIST_ID)) currents.push(contact);
      if (contact.lists.some(list => list.id === LEADS_LIST_ID)) leads.push(contact);
    }
  });

  // Map through both "currents" & "leads" and add any matching contacts (by id) to the "duplicates" array
  currents.map(current => {
    leads.map(lead => {
      if (current.id === lead.id) duplicates.push(current);
    })
  });

  /* 
    Map through the "duplicates" contacts array that contains a contact in both Current and Leads lists
    Then push the email address as the object structure needed for the API POST call
  */
  duplicates.map(contact => {
    contact.email_addresses.map(email => emailAddresses.push({ "email_addresses": [email.email_address] }));
  });

  // If emailAddresses.length > 0, run the "removeContactsEndpoints" function to delete duplicates from the Leads list
  if (emailAddresses.length > 0) {
    removeContactsEndpoints(emailAddresses);
    console.log(`${emailAddresses.length} duplicate contact(s) deleted on ${new Date()}`);
  };
}

// ********** GET ALL CONTACTS ********** //
const fetchAllContacts = async () => {
  const opts = {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ACCESS_TOKEN}`
    }
  }
  const response = await fetch(`${URL}/contacts?api_key=${process.env.API_KEY}`, opts);
  const data = await response.json();
  return data;
}

// ********** REMOVE DUPLICATE CONTACTS FROM LEADS LIST ********** //
const removeContactsEndpoints = async (emailsArray) => {
  const opts = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      "import_data": emailsArray,
      "lists": [
        LEADS_LIST_ID
      ]
    })
  };
  const response = await fetch(`${URL}/activities/removefromlists?api_key=${process.env.API_KEY}`, opts);
  const data = response.json();
  return data;
};

// ********** CRON SCHEDULER ********** //
// const job = new CronJob('* * * * * *', () => {
//   console.log('Script executed.');
//   findAndDeleteDuplicates();
// });

// job.start();

// ********** RUN THE SCRIPT ********** //
findAndDeleteDuplicates();
