// Prayosha ERP - Authentication Controller
// Synchronizes Supabase Auth, Profiles, and Workspace Session Memory

const SUPABASE_PROJECT_URL = window.SUPABASE_URL || 'https://lmzowftkbjdzqmmgxcrf.supabase.co';
const SUPABASE_PUBLIC_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_ey0ZqXs2eGyaJ5y1ZWtrnA_Rul705D0';

const supabaseClient = window.supabaseClient || (window.supabase 
    ? window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLIC_KEY) 
    : null);

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    const feedbackBox = document.getElementById('login-feedback');
    
    const rawUsername = document.getElementById('username').value.trim().toLowerCase();
    const rawPin = document.getElementById('pin').value.trim();

    if (!supabaseClient) {
        feedbackBox.className = "p-3 rounded-lg text-sm font-medium text-center bg-red-100 text-red-800 border border-red-200 block";
        feedbackBox.innerText = "System configuration error: Supabase client not initialized.";
        return;
    }

    const translatedEmail = `${rawUsername}@prayosha.erp`;
    const translatedPassword = `${rawPin}-Prayosha`;

    submitBtn.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-brand-amber inline mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        Authenticating...
    `;
    submitBtn.disabled = true;

    try {
        // 1. Authenticate with Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: translatedEmail,
            password: translatedPassword,
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("Authentication failed. No user record returned.");

        const authUserId = authData.user.id;

        // 2. Fetch User Profile & Role from user_roles (or profiles fallback)
        let profile = null;

        const { data: roleData, error: roleError } = await supabaseClient
            .from('user_roles')
            .select('*')
            .eq('username', rawUsername)
            .maybeSingle();

        if (roleData) {
            profile = roleData;
        } else {
            // Fallback check against profiles master table
            const { data: masterProfile, error: masterProfileError } = await supabaseClient
                .from('profiles')
                .select('*')
                .or(`id.eq.${authUserId},username.eq.${rawUsername}`)
                .maybeSingle();

            if (masterProfile) {
                profile = masterProfile;
            }
        }

        if (!profile) {
            throw new Error("Account authenticated, but no active role profile was found in the directory. Contact Admin.");
        }

        const userRole = profile.role || 'site_engineer';
        const displayName = profile.display_name || profile.full_name || rawUsername;
        const assignedProject = profile.assigned_project || profile.project_id || null;

        // 3. Store Core Workspace Identifiers in LocalStorage
        localStorage.setItem('userId', authUserId);
        localStorage.setItem('userRole', userRole);
        localStorage.setItem('prayosha_user', JSON.stringify({
            id: authUserId,
            username: rawUsername,
            displayName: displayName,
            role: userRole,
            project: assignedProject
        }));

        // 4. Resolve Active Project Details if pre-assigned
        if (assignedProject) {
            const { data: projectRecord } = await supabaseClient
                .from('projects')
                .select('id, project_code, project_name')
                .or(`id.eq.${assignedProject},project_code.eq.${assignedProject}`)
                .maybeSingle();

            if (projectRecord) {
                localStorage.setItem('activeProjectId', projectRecord.id);
                localStorage.setItem('activeProjectCode', projectRecord.project_code || '');
                localStorage.setItem('activeProjectName', projectRecord.project_name || '');
            } else {
                localStorage.setItem('activeProjectId', assignedProject);
            }
        }

        // 5. Success UI & Redirection to Project Dashboard
        feedbackBox.className = "p-3 rounded-lg text-sm font-medium text-center bg-green-100 text-green-800 border border-green-200 block";
        feedbackBox.innerText = `Welcome, ${displayName}! Loading workspace...`;

        setTimeout(() => {
            window.location.href = "projects/project-dashboard.html";
        }, 800);

    } catch (err) {
        feedbackBox.className = "p-3 rounded-lg text-sm font-medium text-center bg-red-100 text-red-800 border border-red-200 block";
        feedbackBox.innerText = `Access Denied: ${err.message || 'Invalid username or PIN'}`;

        submitBtn.innerHTML = `
            <svg class="w-5 h-5 text-brand-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            Secure Login
        `;
        submitBtn.disabled = false;
        document.getElementById('pin').value = '';
    }
});