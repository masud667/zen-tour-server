const fs = require("fs");

const filePath = "./zen-tour-firebase-adminsdk.json";
const serviceAccount = fs.readFileSync(filePath, 'utf8');
// base64 encode
const base64Encoded = Buffer.from(serviceAccount).toString("base64");

console.log(base64Encoded);
