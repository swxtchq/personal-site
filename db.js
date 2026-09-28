// Chooses where users and sessions are stored:
//  - MongoDB, if MONGODB_URI is set (on the hosting, where local files are deleted on restart)
//  - otherwise JSON files in the "data" folder (on a local computer)

module.exports = process.env.MONGODB_URI ? require("./db-mongo") : require("./db-files");
