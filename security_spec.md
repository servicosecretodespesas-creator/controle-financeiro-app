# Security Specification - Expenses System

## Data Invariants
1. An expense can only be read or written by its owner (`userId == request.auth.uid`).
2. A member can only be read or written by its owner (`userId == request.auth.uid`), EXCEPT that a public view exists where anyone can read a member if they have the correct `shareToken` in their query parameters (or we filter by token). Wait, since we are doing sharing, we can allow standard users to fetch members if they have a query filter or we can make members readable by any authenticated user or allow specific public read if there's a valid query token. Let's make it so a user can read any member where `resource.data.userId == request.auth.uid` OR we can allow reading members if querying by `shareToken` so that other people can see their shared dashboard. Let's formulate safe security rules.
3. A budget can only be read or written by its owner (`userId == request.auth.uid`).
4. All timestamps (`createdAt`, `updatedAt`) must match `request.time`.

## The "Dirty Dozen" Payloads (Designed to break laws of Identity, Integrity, and State)

1. **Identity Spoofing - Creating Expense with other's UID**
   ```json
   {
     "description": "Premium Dinner",
     "category": "Food",
     "amount": 250,
     "transactionDate": "2026-07-11",
     "dueDate": "2026-07-11",
     "type": "personal",
     "userId": "ATTACKER_UID_123",
     "isPaid": false
   }
   ```
   *Expected: PERMISSION_DENIED (Must match request.auth.uid)*

2. **Identity Spoofing - Modifying other's Expense**
   ```json
   {
     "description": "Hacked Expense",
     "userId": "VICTIM_UID_456"
   }
   ```
   *Expected: PERMISSION_DENIED (ownerId/userId cannot be altered or accessed by non-owners)*

3. **Value Poisoning - Injecting 1MB String into description**
   ```json
   {
     "description": "A".repeat(1000000),
     "category": "Food",
     "amount": 20,
     "transactionDate": "2026-07-11",
     "dueDate": "2026-07-11",
     "type": "personal",
     "userId": "USER_UID",
     "isPaid": false
   }
   ```
   *Expected: PERMISSION_DENIED (description size exceeds limit of 100 characters)*

4. **Value Poisoning - Invalid Category Type**
   ```json
   {
     "description": "Snacks",
     "category": 12345,
     "amount": 10,
     "transactionDate": "2026-07-11",
     "dueDate": "2026-07-11",
     "type": "personal",
     "userId": "USER_UID",
     "isPaid": false
   }
   ```
   *Expected: PERMISSION_DENIED (category must be string)*

5. **Resource Poisoning - Huge ID Injection**
   `CREATE /expenses/JUNK_CHARACTERS_1.5KB_LONG`
   *Expected: PERMISSION_DENIED (isValidId checks string pattern and size limit <= 128)*

6. **State Shortcutting - Modifying immutable fields**
   ```json
   {
     "description": "Lunch Modified",
     "createdAt": "2020-01-01"
   }
   ```
   *Expected: PERMISSION_DENIED (createdAt must be immutable)*

7. **Date Format Bypassing**
   ```json
   {
     "description": "Rent",
     "category": "Home",
     "amount": 1200,
     "transactionDate": "invalid-date",
     "dueDate": "2026-07-11",
     "type": "personal",
     "userId": "USER_UID",
     "isPaid": false
   }
   ```
   *Expected: PERMISSION_DENIED (transactionDate must match regex YYYY-MM-DD)*

8. **Type Poisoning - Non-number Amount**
   ```json
   {
     "description": "Gas",
     "category": "Transport",
     "amount": "Fifty Dollars",
     "transactionDate": "2026-07-11",
     "dueDate": "2026-07-11",
     "type": "personal",
     "userId": "USER_UID",
     "isPaid": false
   }
   ```
   *Expected: PERMISSION_DENIED (amount must be number)*

9. **PII Exposure - Blanket Read on Members**
   `GET /members` (without filtering by userId)
   *Expected: PERMISSION_DENIED (reads must be explicitly filtered by owner userId or shareToken)*

10. **Privilege Escalation - Creating Budget with Arbitrary ID**
    `CREATE /budgets/ATTACKER_BUDGET` with other user's userId
    *Expected: PERMISSION_DENIED (userId must be request.auth.uid)*

11. **Bypassing Verification**
    User has `request.auth.token.email_verified == false`
    *Expected: PERMISSION_DENIED (All writes require verified email)*

12. **Ghost Fields Injection**
    ```json
    {
      "description": "Snacks",
      "category": "Food",
      "amount": 10,
      "transactionDate": "2026-07-11",
      "dueDate": "2026-07-11",
      "type": "personal",
      "userId": "USER_UID",
      "isPaid": false,
      "isAdmin": true
    }
    ```
    *Expected: PERMISSION_DENIED (No ghost fields allowed, strict keys validation on create)*

## Test Runner Mockup (firestore.rules.test.ts)
A test suite verifying the behavior of the rules. (Standard Firestore emulator tests would run this.)
