const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    const feedbackBox = document.getElementById('login-feedback');
    
    const rawUsername = document.getElementById('username').value.trim().toLowerCase();
    const rawPin = document.getElementById('pin').value.trim();

    const translatedEmail = `${rawUsername}@prayosha.erp`;
    const translatedPassword = `${rawPin}-Prayosha`;

    submitBtn.innerHTML = `Authenticating...`;
    submitBtn.disabled = true;

    try {
        // 1. Authenticate with Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: translatedEmail,
            password: translatedPassword,
        });

        if (authError) throw authError;

        // 2. Fetch User Role & Permissions from user_roles table
        const { data: roleData, error: roleError } = await supabaseClient
            .from('user_roles')
            .select('*')
            .eq('username', rawUsername)
            .single();

        if (roleError || !roleData) {
            throw new Error("Account authenticated, but no role profile was found in the directory. Contact Admin.");
        }

        // 3. Store Session Profile in LocalStorage
        localStorage.setItem('prayosha_user', JSON.stringify({
            username: roleData.username,
            displayName: roleData.display_name,
            role: roleData.role,
            project: roleData.assigned_project
        }));

        // 4. Success UI & Routing
        feedbackBox.className = "p-3 rounded-lg text-sm font-medium text-center bg-green-100 text-green-800 border border-green-200 block";
        feedbackBox.innerText = `Welcome, ${roleData.display_name} (${roleData.role})! Redirecting...`;
        
        setTimeout(() => {
            window.location.href = "tasks/active-tasks.html";
        }, 1000);

    } catch (err) {
        feedbackBox.className = "p-3 rounded-lg text-sm font-medium text-center bg-red-100 text-red-800 border border-red-200 block";
        feedbackBox.innerText = `Access Denied: ${err.message}`;
        
        submitBtn.innerHTML = `
            <svg class="w-5 h-5 text-brand-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            Secure Login
        `;
        submitBtn.disabled = false;
        document.getElementById('pin').value = '';
    }
});