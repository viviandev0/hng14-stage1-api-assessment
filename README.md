# hng14-stage1-api-assessment

A high-performance Node.js API that generates intelligent user profiles by integrating multiple external data services (Agify, Genderize, and Nationalize).

## 🚀 Live Demo
**Public URL:** https://hng14-stage1-api-assessment.vercel.app/
**API Endpoint:** `/api/profiles`

##  Tech Stack
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL (via Railway)
- **Deployment:** Railway
- **External APIs:** Agify.io, Genderize.io, Nationalize.io

##  Features
- **Data Enrichment:** Automatically predicts age, gender, and nationality based on a provided name.
- **Persistence:** Saves enriched profiles to a PostgreSQL database.
- **Idempotency:** Checks for existing records to prevent duplicate processing.
- **Error Handling:** Graceful handling of external service timeouts or invalid data.

##  API Usage

### GET `/api/profiles`
Returns a list of all stored profiles.

### POST `/api/profiles`
Processes a new name and saves the enriched data.

**Request Body:**
```json
{
  "name": "Ella"
}
