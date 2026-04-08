require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'TeteriaEncantada',
});

(async () => {
  await client.connect();
  const query = `
    select id, username, email, "isActive", "createdAt"
    from users
    where lower(coalesce(username, '')) = lower($1)
       or lower(email) = lower($1)
    order by "createdAt" desc
    limit 10
  `;
  const result = await client.query(query, ['GCaro']);
  console.log(JSON.stringify(result.rows, null, 2));
  await client.end();
})().catch(async (error) => {
  console.error(error.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
