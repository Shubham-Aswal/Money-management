 let isLogin = true;

        function toggleMode() {
            isLogin = !isLogin;
            
            const title = document.getElementById('form-title');
            const subtitle = document.getElementById('form-subtitle');
            const submitBtn = document.getElementById('submit-btn');
            const toggleText = document.getElementById('toggle-text');
            const toggleBtn = document.getElementById('toggle-btn');
            const nameField = document.getElementById('name-field');
            const loginExtras = document.getElementById('login-extras');

            if (isLogin) {
                // Switch to Login Mode
                title.textContent = "Welcome back to Spendly.";
                subtitle.textContent = "Enter your details to access your dashboard.";
                submitBtn.textContent = "Log In";
                toggleText.textContent = "Don't have an account?";
                toggleBtn.textContent = "Sign Up";
                
                // Hide Name
                nameField.classList.remove('visible-field');
                nameField.classList.add('hidden-field');
                
                // Show Extras
                setTimeout(() => {
                    loginExtras.style.display = 'flex';
                }, 100);

            } else {
                // Switch to Sign Up Mode
                title.textContent = "Join the Club.";
                subtitle.textContent = "Start mastering your money flow today.";
                submitBtn.textContent = "Create Account";
                toggleText.textContent = "Already have an account?";
                toggleBtn.textContent = "Log In";
                
                // Show Name
                nameField.classList.remove('hidden-field');
                nameField.classList.add('visible-field');
                
                // Hide Extras
                loginExtras.style.display = 'none';
            }
        }