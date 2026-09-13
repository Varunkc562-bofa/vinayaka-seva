# Vinayaka Seva — Product Requirements Document

## Vision
A premium, culturally-rooted mobile app that helps Ganesh Chaturthi committee members — from President to Volunteer — run every seva together with joy, transparency, and simplicity.

## Tech
- **Frontend**: Expo (React Native), Expo Router, React Query, Reanimated, expo-image, expo-linear-gradient, expo-haptics
- **Backend**: FastAPI + Motor + MongoDB
- **Auth**: Emergent Managed Google OAuth (first user → President)
- **AI**: Seva AI powered by Gemini 3 Flash via Emergent Universal LLM Key (streaming SSE)
- **Design system**: Saffron `#E65100` / Gold `#D4AF37` / Cream `#FAFAF5` / Temple Maroon `#800000`, Cormorant Garamond (display) + Plus Jakarta Sans (text)

## Roles (15)
President, Vice President, Secretary, Joint Secretary, Treasurer, Pooja Coordinator, Volunteer Coordinator, Food Coordinator, Decoration Coordinator, Cultural Coordinator, Security Coordinator, Media Coordinator, General Committee Member, Volunteer, Regular Member.

## Tabs (4)
1. **Home** — Ganesha hero + countdown + stat grid (collected/spent/balance/volunteers) + pending/critical mini-cards + quick actions rail + today's events + recent announcements
2. **Tasks** — chip filter (All/To do/Doing/Done), scope toggle (Mine/All), oversized cards with priority pill, one-tap complete with haptic, add/edit/delete via bottom sheet. Edit allowed for officer/author/assignee; delete for officer/author only (status toggle open to all committee members)
3. **Community** — segmented Events / Members. Presidents/VPs/Secretaries can reassign any member's role.
4. **More** — profile card + 3-col tile grid (Donations, Expenses, Seva AI, Announcements, Shifts, Profile) + sign out

## Modules
- **Donations** — donor name, amount, mode (cash/UPI/bank), note. Live total.
- **Expenses** — amount, category, vendor, description. Approval flow (President/Treasurer/VP only).
- **Announcements** — pinnable posts with author + role.
- **Seva AI** — SSE-streaming chat over the committee's live Firestore-equivalent data; suggested prompts.
- **Shifts** — event-driven duty schedule.
- **Profile** — identity + sign out.

## RBAC matrix
| Action | Allowed roles |
|---|---|
| Update member role | President, VP, Secretary |
| Approve expense | President, Treasurer, VP |
| Set festival date | President, Secretary |
| Seed demo data | President |
| Everything else authenticated | all logged-in users |

## Data (MongoDB)
- `users` (user_id, email, name, picture, role, phone)
- `user_sessions` (session_token TTL 7d)
- `tasks`, `donations`, `expenses`, `announcements`, `events`, `shifts`, `ai_messages`, `config`

## Verified
- 28/28 backend tests pass — auth, RBAC, CRUD, Gemini streaming.
- Login screen renders with premium Ganesha hero.
