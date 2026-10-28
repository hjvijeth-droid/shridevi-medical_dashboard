-- Relational design behind the dashboard's SQL explorer (PostgreSQL / SQLite compatible).
-- The bundled Node server keeps a simple document table; use this schema when you move to a full SQL database.
CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
INSERT INTO departments (name) VALUES ('ICU'), ('Emergency'), ('Pediatrics'), ('General Ward');

CREATE TABLE beds (
  id TEXT PRIMARY KEY,                       -- e.g. IC-05
  dept_id INTEGER NOT NULL REFERENCES departments (id),
  occupied BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE patients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL, phone TEXT NOT NULL,
  national_id_masked TEXT NOT NULL,          -- last four digits only
  address TEXT, sex CHAR(1), age INTEGER CHECK (age BETWEEN 1 AND 120),
  blood_group TEXT, diagnosis TEXT, allergies TEXT,
  dept_id INTEGER NOT NULL REFERENCES departments (id),
  bed_id TEXT REFERENCES beds (id),
  status TEXT NOT NULL CHECK (status IN ('Admitted','Observation','Critical','Stable','Discharged')),
  admit_date DATE NOT NULL
);

CREATE TABLE doctors (id INTEGER PRIMARY KEY, name TEXT NOT NULL, specialty TEXT, on_duty BOOLEAN DEFAULT FALSE);
CREATE TABLE doctor_schedule (doctor_id INTEGER REFERENCES doctors (id), weekday SMALLINT CHECK (weekday BETWEEN 1 AND 7), PRIMARY KEY (doctor_id, weekday));

CREATE TABLE nurse_staffing (
  dept_id INTEGER REFERENCES departments (id),
  shift TEXT CHECK (shift IN ('Morning','Evening','Night')),
  nurses_on_duty INTEGER NOT NULL,
  PRIMARY KEY (dept_id, shift)
);
CREATE TABLE nurse_roster (dept_id INTEGER PRIMARY KEY REFERENCES departments (id), employed INTEGER NOT NULL);

-- Queries used by the SQL explorer
SELECT d.name AS department, COUNT(*) AS patients
FROM patients p JOIN departments d ON d.id = p.dept_id
GROUP BY d.name ORDER BY patients DESC;

SELECT d.name, COUNT(b.id) AS occupied, s.nurses_on_duty,
       ROUND(COUNT(b.id) * 1.0 / s.nurses_on_duty, 2) AS load
FROM beds b
JOIN departments d ON d.id = b.dept_id
JOIN nurse_staffing s ON s.dept_id = d.id AND s.shift = 'Morning'
WHERE b.occupied
GROUP BY d.name, s.nurses_on_duty;
