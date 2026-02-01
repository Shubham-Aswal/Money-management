// ========================================================================
// FILE PURPOSE: Login/Signup Page Toggle Controller
// ========================================================================
// This file handles switching between two different forms on the same page:
// 1. LOGIN form - for existing users to sign in
// 2. SIGNUP form - for new users to create an account
//
// Instead of having two separate pages, we use ONE page and just change
// the text and fields based on which mode the user wants.
// ========================================================================

// ========================================================================
// VARIABLE: isLogin
// ========================================================================
// This variable keeps track of which mode we're currently in.
// - TRUE means we're showing the LOGIN form (for existing users)
// - FALSE means we're showing the SIGNUP form (for new users)
// 
// We start with TRUE because when the page first loads, we want to show
// the login form by default (most people will be returning users).
// ========================================================================
let isLogin = true;

// ========================================================================
// FUNCTION: toggleMode()
// ========================================================================
// This function is called when the user clicks the "Sign Up" or "Log In" 
// button at the bottom of the form. It switches the page between two modes:
//
// LOGIN MODE:
// - Shows "Welcome back to Spendly" message
// - Only asks for email and password (no name field)
// - Button says "Log In"
// - Shows extra options like "Forgot Password?" and "Continue with Google"
//
// SIGNUP MODE:
// - Shows "Join the Club" message
// - Asks for name, email, and password
// - Button says "Create Account"
// - Hides extra options to keep it simple
//
// HOW IT WORKS:
// 1. First, it flips the isLogin variable (true becomes false, false becomes true)
// 2. Then it finds all the elements on the page that need to change
// 3. Finally, it updates the text and visibility based on the new mode
// ========================================================================
function toggleMode() {
    // ====================================================================
    // STEP 1: Flip the mode
    // ====================================================================
    // The ! symbol means "opposite" or "not"
    // So if isLogin is true, this makes it false
    // And if isLogin is false, this makes it true
    // ====================================================================
    isLogin = !isLogin;
    
    // ====================================================================
    // STEP 2: Find all the elements on the page that we need to change
    // ====================================================================
    // Each "getElementById" finds a specific element on the webpage by its ID
    // Think of IDs like name tags - they help us find the right element
    // ====================================================================
    
    const title = document.getElementById('form-title');           // Main heading text
    const subtitle = document.getElementById('form-subtitle');     // Subtitle below heading
    const submitBtn = document.getElementById('submit-btn');       // The main button (Login/Signup)
    const toggleText = document.getElementById('toggle-text');     // "Don't have an account?" text
    const toggleBtn = document.getElementById('toggle-btn');       // The "Sign Up"/"Log In" link
    const nameField = document.getElementById('name-field');       // The name input field
    const loginExtras = document.getElementById('login-extras');   // Extra options section

    // ====================================================================
    // STEP 3: Update everything based on which mode we're in
    // ====================================================================
    if (isLogin) {
        // ================================================================
        // LOGIN MODE - What happens when user wants to LOG IN
        // ================================================================
        
        // Change the main heading to welcome back existing users
        title.textContent = "Welcome back to Spendly.";
        
        // Change the subtitle to tell them what to do
        subtitle.textContent = "Enter your details to access your dashboard.";
        
        // Change the button text to say "Log In"
        submitBtn.textContent = "Log In";
        
        // Update the bottom text to ask if they need to sign up instead
        toggleText.textContent = "Don't have an account?";
        
        // Update the clickable link to say "Sign Up"
        toggleBtn.textContent = "Sign Up";
        
        // ================================================================
        // HIDE the name field (we don't need it for login)
        // ================================================================
        // We remove the CSS class that makes it visible
        nameField.classList.remove('visible-field');
        // And add the CSS class that hides it
        nameField.classList.add('hidden-field');
        
        // ================================================================
        // SHOW the extra login options (Forgot Password, Google login)
        // ================================================================
        // We use setTimeout to wait 100 milliseconds (0.1 seconds) before showing it
        // This creates a smooth animation effect instead of it appearing instantly
        setTimeout(() => {
            loginExtras.style.display = 'flex';  // Make it visible
        }, 100);

    } else {
        // ================================================================
        // SIGNUP MODE - What happens when user wants to CREATE ACCOUNT
        // ================================================================
        
        // Change the main heading to welcome new users
        title.textContent = "Join the Club.";
        
        // Change the subtitle to encourage them to start
        subtitle.textContent = "Start mastering your money flow today.";
        
        // Change the button text to say "Create Account"
        submitBtn.textContent = "Create Account";
        
        // Update the bottom text to ask if they already have an account
        toggleText.textContent = "Already have an account?";
        
        // Update the clickable link to say "Log In"
        toggleBtn.textContent = "Log In";
        
        // ================================================================
        // SHOW the name field (we need it for creating new accounts)
        // ================================================================
        // We remove the CSS class that hides it
        nameField.classList.remove('hidden-field');
        // And add the CSS class that makes it visible with animation
        nameField.classList.add('visible-field');
        
        // ================================================================
        // HIDE the extra login options (keep signup simple)
        // ================================================================
        loginExtras.style.display = 'none';  // Make it invisible immediately
    }
}