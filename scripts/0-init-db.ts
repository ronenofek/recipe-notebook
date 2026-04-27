import 'dotenv/config';
import { getDb } from '../src/lib/db';

const db = getDb();
console.log('Database initialized at db/recipe-notebook.db');
console.log('Tables created:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
