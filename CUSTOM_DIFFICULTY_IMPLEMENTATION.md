# Custom Difficulty Flow - Backend Implementation

## Overview
This document outlines the backend implementation for the Custom Difficulty Flow feature, which allows administrators to create custom exams by selecting questions based on difficulty levels.

## Architecture Analysis

### Database
- **Driver**: Prisma with PostgreSQL
- **Question Model**: Contains `difficulty` field (enum: EASY, MEDIUM, HARD)
- **QuestionPaper Model**: Stores exam configurations
- **PaperQuestion Model**: Junction table linking questions to papers

### Code Patterns
- **Naming Convention**: camelCase for variables and functions
- **Response Format**: `{ success: boolean, message?: string, data?: any }`
- **Error Handling**: Try-catch blocks with appropriate HTTP status codes
- **Authorization**: JWT-based with role-based access control (ADMIN, TEACHER, STUDENT)

## New Endpoints

### 1. GET `/api/admin/difficulty-stats/:examId`

**Purpose**: Get aggregated question counts by difficulty for a specific exam.

**Authorization**: ADMIN, TEACHER roles required

**Request Parameters**:
- `examId` (path parameter): The ID of the exam

**Response Format**:
```json
{
  "success": true,
  "examId": 1,
  "examTitle": "Mock Test 1",
  "stats": {
    "easy": 30,
    "medium": 40,
    "hard": 30
  }
}
```

**Error Responses**:
- `400`: Invalid exam ID
- `404`: Exam not found
- `500`: Internal server error

**Controller Function**: `getDifficultyStats`

**Implementation Details**:
1. Validates and parses the examId parameter
2. Verifies exam exists in the database
3. Queries PaperQuestion junction table to get all questions for the exam
4. Groups questions by difficulty level
5. Returns aggregated counts

---

### 2. POST `/api/admin/generate-custom`

**Purpose**: Create a custom exam by selecting random unique questions based on difficulty slots.

**Authorization**: ADMIN, TEACHER roles required

**Request Body**:
```json
{
  "title": "Custom Mock Test",
  "slots": [
    { "difficulty": "EASY" },
    { "difficulty": "HARD" },
    { "difficulty": "MEDIUM" },
    { "difficulty": "EASY" }
  ],
  "durationHours": 3,
  "startTime": "2025-12-25T10:00:00Z",
  "adminId": 1
}
```

**Response Format**:
```json
{
  "success": true,
  "message": "Custom exam created successfully.",
  "paperId": 42,
  "totalQuestions": 4,
  "distribution": {
    "EASY": 2,
    "MEDIUM": 1,
    "HARD": 1
  }
}
```

**Error Responses**:
- `400`: Invalid request format or insufficient questions
- `500`: Internal server error

**Controller Function**: `generateCustomExam`

**Selection Algorithm**:
1. **Input Validation**: Validates title, slots array, and difficulty values
2. **Difficulty Grouping**: Counts how many questions needed per difficulty
3. **Question Fetching**: For each difficulty level:
   - Fetches available questions from database
   - Validates sufficient questions exist
   - Uses Fisher-Yates shuffle for randomization
   - Selects required number of unique questions
4. **Deduplication**: Uses a Set to track used question IDs, preventing duplicates
5. **Final Randomization**: Shuffles the complete question list to mix difficulties
6. **Persistence**: Creates QuestionPaper with associated PaperQuestion entries

## Database Schema Updates

**No schema changes required**. The existing models support custom exam types:
- `QuestionPaper.title`: Distinguishes custom exams by title
- `QuestionPaper.isActive`: Set to `false` by default for custom exams
- `PaperQuestion`: Junction table stores the selected questions

## Code Location

### Files Modified:
1. **`Controllers/adminController.js`**:
   - Added `getDifficultyStats` function (lines ~1120-1170)
   - Added `generateCustomExam` function (lines ~1172-1270)
   - Updated exports to include new functions

2. **`server.js`**:
   - Added route: `GET /api/admin/difficulty-stats/:examId`
   - Added route: `POST /api/admin/generate-custom`
   - Routes placed in ADMIN section with proper middleware

## Helper Functions Used

### `shuffleArray(array)`
- **Location**: Already exists in adminController.js
- **Purpose**: Fisher-Yates shuffle algorithm for randomizing arrays
- **Usage**: Ensures truly random question selection

## Testing Endpoints

### Test GET /difficulty-stats/:examId
```bash
curl -X GET http://localhost:3000/api/admin/difficulty-stats/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Test POST /generate-custom
```bash
curl -X POST http://localhost:3000/api/admin/generate-custom \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "Custom Test 1",
    "slots": [
      {"difficulty": "EASY"},
      {"difficulty": "MEDIUM"},
      {"difficulty": "HARD"}
    ],
    "durationHours": 3,
    "adminId": 1
  }'
```

## Frontend Integration

The frontend should:
1. Call `GET /difficulty-stats/:examId` to show available questions per difficulty
2. Allow users to select difficulty slots in the UI
3. Submit the slots array to `POST /generate-custom`
4. Navigate to preview page using the returned `paperId`

## Security Considerations

1. **Authentication**: Both endpoints require valid JWT token
2. **Authorization**: Only ADMIN and TEACHER roles can access
3. **Input Validation**: All inputs validated before database queries
4. **SQL Injection**: Protected by Prisma's parameterized queries
5. **Resource Limits**: Validates sufficient questions exist before creating exam

## Error Handling

All endpoints follow consistent error patterns:
- Input validation errors return 400 status
- Resource not found errors return 404 status
- Server errors return 500 status with safe error messages
- Errors logged to console for debugging

## Performance Considerations

1. **Database Queries**: Optimized with proper indexes on foreign keys
2. **Randomization**: In-memory shuffling instead of ORDER BY RANDOM()
3. **Batch Operations**: Uses Prisma's createMany for efficient insertions
4. **Query Optimization**: Uses select to limit returned fields

## Future Enhancements

Potential improvements:
1. Add subject-based filtering to difficulty slots
2. Support topic-level granularity in slot selection
3. Add preview before final exam creation
4. Support exam templates for reuse
5. Add validation for minimum/maximum questions per difficulty

## Compliance with Existing Patterns

✅ **Naming Conventions**: camelCase maintained  
✅ **Response Format**: Matches existing `{ success, message, data }` pattern  
✅ **Error Handling**: Consistent try-catch with status codes  
✅ **Authorization**: Uses existing middleware  
✅ **Database Access**: Uses shared Prisma instance  
✅ **Code Style**: Matches existing controller structure
