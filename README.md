# Transformer-less AC-AC Stabilizer — IoT Based Smart Monitoring

Landing page (scroll-driven 240-frame converter) → sign-in → the existing dashboard.
Plain HTML/CSS/JS, no build step. Serve the folder with any static server
(`python3 -m http.server`) or open `index.html` directly.

| Path | What it is |
|---|---|
| `index.html` | Landing page + sign-in section (`/#sign-in`) |
| `sign-in/index.html` | Redirects to the sign-in section |
| `dashboard/` | Your existing dashboard. Only change: one `<script src="../auth/auth-guard.js">` line in `index.html` |
| `landing/` | `sequence.js` (frame engine), `landing.js` (scroll/nav/sign-in), `landing.css`, `bolts.js` |
| `auth/` | `auth-config.js`, `auth.js` (demo/API providers), `auth-guard.js` (dashboard gate) |
| `assets/frames/` | Your 240 original JPGs (untouched) + `manifest.js` |
| `assets/mattes/` | Per-frame transparency mattes (background only) |
| `tools/` | `build_manifest.py` (numeric sort), `build_mattes.py` |

## Notes
- **Frames:** the supplied frames have a light studio background. The site draws each original JPG and applies its
  matte so the converter floats on the dark page. Set `landing.useMatte:false` in `auth/auth-config.js` to show raw frames.
- **Auth (Supabase):** `mode:'supabase'` in `auth/auth-config.js`. Put your Project URL and anon key there. In Supabase turn OFF
  "Allow new users to sign up" and create ONE admin user by hand (Auth → Users → Add user, Auto Confirm). Only that account can sign in.
  Never put the `service_role` key in this project.
- **Auth (other modes):** `mode:'demo'` accepts any well-formed credentials (no passwords stored or hard-coded). Set `mode:'api'` and
  `apiBase` to use a backend (`POST {apiBase}/sign-in` → `{token,user:{name},expiresIn}`). A client-side gate is not
  security; enforce access on the server too.
- **Dev bypass:** set `ENFORCE=false` at the top of `auth/auth-guard.js` to open the dashboard without signing in.
- **Changing frames:** replace files in `assets/frames`, run `python3 tools/build_mattes.py assets/frames assets/mattes`
  then `python3 tools/build_manifest.py`.
- **Reduced motion:** shows one static frame, simple fades, no scrubbing.
