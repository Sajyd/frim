// Frim Authentication System
// Simple client-side authentication for demo purposes

class FrimAuth {
    constructor() {
        // Demo credentials
        this.validUsers = [
            { email: 'demo@frim.app', password: 'demo123' },
            { email: 'admin@frim.app', password: 'admin123' },
            { email: 'test@test.com', password: 'test123' }
        ];
        
        this.isAuthenticated = false;
        this.currentUser = null;
        
        this.init();
    }
    
    init() {
        // Check for existing session
        const session = localStorage.getItem('frim_session');
        if (session) {
            try {
                const userData = JSON.parse(session);
                if (userData && userData.email) {
                    this.isAuthenticated = true;
                    this.currentUser = userData;
                    this.showApp();
                    return;
                }
            } catch (e) {
                localStorage.removeItem('frim_session');
            }
        }
        
        // Show landing page
        this.showLanding();
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Show login modal
        const btnShowLogin = document.getElementById('btn-show-login');
        const btnGetStarted = document.getElementById('btn-get-started');
        const btnTryDemo = document.getElementById('btn-try-demo');
        
        btnShowLogin?.addEventListener('click', () => this.showLoginModal());
        btnGetStarted?.addEventListener('click', () => this.showLoginModal());
        btnTryDemo?.addEventListener('click', () => this.loginAsDemo());
        
        // Close login modal
        const btnCloseLogin = document.getElementById('btn-close-login');
        const loginOverlay = document.getElementById('login-overlay');
        
        btnCloseLogin?.addEventListener('click', () => this.hideLoginModal());
        loginOverlay?.addEventListener('click', (e) => {
            if (e.target === loginOverlay) this.hideLoginModal();
        });
        
        // Login form submission
        const loginForm = document.getElementById('login-form');
        loginForm?.addEventListener('submit', (e) => this.handleLogin(e));
        
        // Toggle password visibility
        const togglePassword = document.getElementById('toggle-password');
        togglePassword?.addEventListener('click', () => this.togglePasswordVisibility());
        
        // Logout
        const btnLogout = document.getElementById('btn-logout');
        btnLogout?.addEventListener('click', () => this.logout());
        
        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hideLoginModal();
        });
    }
    
    showLoginModal() {
        const overlay = document.getElementById('login-overlay');
        overlay?.classList.add('active');
        
        // Focus email input
        setTimeout(() => {
            document.getElementById('login-email')?.focus();
        }, 100);
    }
    
    hideLoginModal() {
        const overlay = document.getElementById('login-overlay');
        overlay?.classList.remove('active');
        
        // Clear form
        const form = document.getElementById('login-form');
        form?.reset();
        
        // Hide error
        const error = document.getElementById('login-error');
        error?.classList.add('hidden');
    }
    
    togglePasswordVisibility() {
        const passwordInput = document.getElementById('login-password');
        const toggleBtn = document.getElementById('toggle-password');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
            `;
        } else {
            passwordInput.type = 'password';
            toggleBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                </svg>
            `;
        }
    }
    
    handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('login-email')?.value?.trim();
        const password = document.getElementById('login-password')?.value;
        const errorEl = document.getElementById('login-error');
        
        // Validate
        const user = this.validUsers.find(u => 
            u.email.toLowerCase() === email.toLowerCase() && 
            u.password === password
        );
        
        if (user) {
            this.login(user);
        } else {
            // Show error
            errorEl?.classList.remove('hidden');
            
            // Shake animation
            const modal = document.querySelector('.login-modal');
            modal?.classList.add('shake');
            setTimeout(() => modal?.classList.remove('shake'), 500);
        }
    }
    
    loginAsDemo() {
        const demoUser = this.validUsers[0];
        this.login(demoUser);
    }
    
    login(user) {
        this.isAuthenticated = true;
        this.currentUser = { email: user.email };
        
        // Save session
        localStorage.setItem('frim_session', JSON.stringify(this.currentUser));
        
        // Hide modal and show app
        this.hideLoginModal();
        this.showApp();
    }
    
    logout() {
        this.isAuthenticated = false;
        this.currentUser = null;
        
        // Clear session
        localStorage.removeItem('frim_session');
        
        // Show landing
        this.showLanding();
    }
    
    showLanding() {
        document.getElementById('landing-page')?.classList.add('active');
        document.getElementById('welcome-screen')?.classList.remove('active');
        document.getElementById('editor-screen')?.classList.remove('active');
    }
    
    showApp() {
        document.getElementById('landing-page')?.classList.remove('active');
        document.getElementById('welcome-screen')?.classList.add('active');
        document.getElementById('editor-screen')?.classList.remove('active');
    }
}

// Add shake animation CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
    .login-modal.shake {
        animation: shake 0.5s ease-in-out;
    }
`;
document.head.appendChild(style);

// Initialize auth when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.frimAuth = new FrimAuth();
});

