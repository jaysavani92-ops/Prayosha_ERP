// Initialize the Supabase Client using a unique variable name (supabaseClient)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test Connection Function
async function testConnection() {
    const statusText = document.getElementById('status-message');
    
    try {
        // Attempt to fetch 1 row from the user_roles table to verify connection
        const { data, error } = await supabaseClient.from('user_roles').select('*').limit(1);
        
        if (error) throw error;
        
        statusText.innerHTML = `<span class="text-green-600 font-semibold">Success!</span> Connected to Supabase Project successfully.`;
        console.log("Database connection established.");
        
    } catch (err) {
        statusText.innerHTML = `<span class="text-red-600 font-semibold">Connection Failed:</span> ${err.message}`;
        console.error("Supabase Connection Error:", err);
    }
}

// Run test on load
document.addEventListener('DOMContentLoaded', testConnection);