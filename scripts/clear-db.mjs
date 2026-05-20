import "dotenv/config";
import { unlinkSync, existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "data/personal-agent.sqlite";

if (databaseUrl !== ":memory:" && !databaseUrl.startsWith("file:")) {
  const databasePath = isAbsolute(databaseUrl)
    ? databaseUrl
    : resolve(process.cwd(), databaseUrl);

  if (existsSync(databasePath)) {
    try {
      unlinkSync(databasePath);
      console.log(`已成功清空（删除）数据库: ${databasePath}`);
    } catch (err) {
      console.error(`无法删除数据库文件 ${databasePath}:`, err);
    }
  } else {
    console.log(`未找到需要删除的数据库文件: ${databasePath}`);
  }
} else {
  console.log(`当前使用的内存数据库或不支持直接删除: ${databaseUrl}`);
}
