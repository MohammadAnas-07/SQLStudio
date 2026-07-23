-- Step 1: Table banana
CREATE TABLE Employees (
    EmpID INT PRIMARY KEY,
    FirstName VARCHAR(50),
    LastName VARCHAR(50),
    Salary DECIMAL(10, 2),
    JoinDate DATE
);

-- Step 2: Table mein data insert karna
INSERT INTO Employees (EmpID, FirstName, LastName, Salary, JoinDate)
VALUES 
(1, 'Rahul', 'Sharma', 50000.00, '2025-01-15'),
(2, 'Priya', 'Verma', 62000.50, '2024-11-10'),
(3, 'Amit', 'Kumar', 45000.00, '2026-03-01');

-- Step 3: Table se saara data select karke dekhna
SELECT * FROM Employees;
