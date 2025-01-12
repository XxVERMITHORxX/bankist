// netlify/functions/bankist-api.js
const sqlite3 = require('sqlite3').verbose();

exports.handler = async (event, context) => {
  // Database connection (you may need to use a temporary folder like '/tmp' on Netlify)
  const db = new sqlite3.Database('/tmp/mydb.sqlite');
  
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM users", [], (err, rows) => {
      if (err) {
        reject({
          statusCode: 500,
          body: JSON.stringify({ message: "Database error", error: err.message })
        });
      }
      resolve({
        statusCode: 200,
        body: JSON.stringify(rows)
      });
    });
  }).finally(() => {
    db.close();
  });
};
