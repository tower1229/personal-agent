import "dotenv/config";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";

const databaseUrl = process.env.DATABASE_URL ?? "data/personal-agent.sqlite";

if (databaseUrl !== ":memory:" && !databaseUrl.startsWith("file:")) {
  const databasePath = isAbsolute(databaseUrl)
    ? databaseUrl
    : resolve(process.cwd(), databaseUrl);

  if (existsSync(databasePath)) {
    try {
      const db = new Database(databasePath);
      
      // 查询除系统表外的所有业务表
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      
      if (tables.length > 0) {
        // 逐一删除表结构及数据
        for (const table of tables) {
          db.prepare(`DROP TABLE IF EXISTS "${table.name}"`).run();
        }
        console.log(`成功通过程序清空了所有数据表，共删除了 ${tables.length} 张表: ${databasePath}`);
      } else {
        console.log(`数据库中已经是空表，无需删除: ${databasePath}`);
      }

      db.close();
    } catch (err) {
      console.error(`尝试清空数据库失败。如果报错为 SQLITE_BUSY，说明仍有程序（比如VSCode插件、开发服务器等）占用着独占锁，请彻底关闭占用程序后再试！`, err);
    }
  } else {
    console.log(`未找到数据库文件: ${databasePath}`);
  }
} else {
  console.log(`当前使用的是内存数据库或不支持直接操作: ${databaseUrl}`);
}
