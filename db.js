// Chooses where users and sessions are stored:
//  - PostgreSQL, if DATABASE_URL is set (on the hosting, where local files are deleted on restart)
//  - otherwise JSON files in the "data" folder (on a local computer)

module.exports = process.env.DATABASE_URL ? require("./db-postgres") : require("./db-files");
