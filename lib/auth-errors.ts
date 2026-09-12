export function authErrorMessage(error?: string | null) {
  switch (error) {
    case 'OAuthAccountNotLinked':
      return 'This email is already used with another sign-in method. Use email and password, or the provider you signed up with.'
    case 'OAuthCallback':
    case 'OAuthSignin':
    case 'OAuthCreateAccount':
    case 'Callback':
      return 'GitHub/Google sign-in failed. Open https://frim.app (not www.frim.app) and try again.'
    case 'AccessDenied':
      return 'Access was denied. Try another account.'
    case 'Configuration':
      return 'Sign-in is misconfigured. Check NEXTAUTH_SECRET and the GitHub/Google OAuth keys.'
    case 'CredentialsSignin':
      return 'Invalid email or password'
    case 'Default':
      return 'Sign-in failed. Please try again.'
    default:
      return error ? 'Sign-in failed. Please try again.' : ''
  }
}
