# Dr. Sohaib WhatsApp AI Chatbot & Appointment System

Production-oriented Node.js, Express, MongoDB and Meta WhatsApp Cloud API appointment system for Dr. Sohaib, Specialist Physician & Surgeon. The root web interface uses the same appointment APIs as WhatsApp; clinic availability is controlled by database-backed locations.

## Local setup

Requirements: Node.js 18+, npm, and MongoDB.

```powershell
Copy-Item .env.example .env
npm install
npm test
npm run seed
npm start
```

Open `http://localhost:3000`. The health endpoint is `http://localhost:3000/api/health`.

## Configuration

Fill required production values in `.env`. Important variables are `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, `FRONTEND_URL`, `CORS_ORIGINS`, `CLINIC_TIMEZONE`, `CLINIC_CONTACT_NUMBER`, `DEFAULT_CLINIC_LOCATION_CODE`, `PUBLIC_WHATSAPP_NUMBER`, `ADMIN_PANEL_URL`, `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`, and optional `OPENAI_API_KEY`.

## Active Clinic & Schedule

Initial data: Iqbal Hospital, Noor Mahal Road, Bahawalpur (`BWP`) is bookable Monday–Thursday, 4:30–8:30 PM in 15-minute slots. Bahawalnagar and Rahim Yar Khan are marked as Coming Soon and cannot be booked.

Appointment IDs use `DS-{YEAR}-{SEQUENCE}`. Tokens are derived from time order within the location schedule.

## Demo Users

- Super Admin: `admin@drsohaibdemo.com` / `Admin@123`
- Doctor: `doctor@drsohaibdemo.com` / `Doctor@123`
- Receptionist: `reception@drsohaibdemo.com` / `Reception@123`
- Clinic Staff: `staff@drsohaibdemo.com` / `Staff@123`
