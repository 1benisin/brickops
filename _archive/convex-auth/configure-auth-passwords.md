# Passwords - Convex Auth

## Passwords

> Make sure you're done with [setup](https://labs.convex.dev/auth/setup) before configuring authentication methods

This authentication method relies on the user to remember (or preferably store in a password manager software) a secret password.

Proper password-based authentication system requires at minimum a way for the user to reset their password (usually via email or text).

You might also want to require email verification (during initial sign up or afterwards) to prevent users from accidentally or maliciously using the wrong email.

## Email + password setup[](#email--password-setup)

You can implement the email (or username) and password sign-in via the `Password` provider config.

When you're done configuring your chosen authentication methods, learn how to use authentication in your frontend and backend in [Authorization](https://labs.convex.dev/auth/authz).

## Email reset setup[](#email-reset-setup)

Email reset is essentially a completely separate sign-in flow with two steps:

1.  The user requests a password reset link/code to be sent to their email address
2.  The user either clicks on the link or fills out the code on the website, and also fills out a new password

This is very similar to the [Magic Links](https://labs.convex.dev/auth/config/email) and [OTPs](https://labs.convex.dev/auth/config/otps) authentication methods, and the implementation will also be similar.

Note that password reset via a link will require you to implement some form of routing so that your app knows that it should be rendering the 2nd password reset step.

## Email verification setup[](#email-verification-setup)

### Provider configuration[](#provider-configuration-2)

The `Password` provider included in Convex Auth supports a verification flow via the `verify` option, which takes an Auth.js email provider.

First, create a custom email provider.

This example sends an OTP and uses additional dependencies

Check out the [example repo (opens in a new tab)](https://github.com/get-convex/convex-auth-example/blob/main/convex/otp/ResendOTP.ts) for a more polished email template.

Then use it in `convex/auth.ts`:

### Add verification form[](#add-verification-form)

By configuring the `verify` option the `Password` provider automatically checks whether the user has verified their email during the sign-in flow.

If the user previously verified their email, they will be immediately signed-in.

The async `signIn` function returns a boolean indicating whether the sign-in was immediately successful. In the example below we don't check it, as we assume that the whole `SignIn` component will be unmounted when the user is signed-in.

Check out the [example repo (opens in a new tab)](https://github.com/get-convex/convex-auth-example/blob/main/src/auth/SignInFormPasswordAndVerifyViaCode.tsx) for a more polished UI.

## Customize sign-up form validation[](#customize-sign-up-form-validation)

You'll want to improve the input validation for your sign-up form. Some suggestions:

- Use [Zod (opens in a new tab)](https://zod.dev/) to validate basics like email format and password length, and share the logic between client and backend
- Use [haveibeenpwned (opens in a new tab)](https://haveibeenpwned.com/) to check whether the email the user wants to use has been previously leaked
- Use [zxcvbn-ts (opens in a new tab)](https://zxcvbn-ts.github.io/zxcvbn/) to require a minimum password strength

Remember to use [`ConvexError` (opens in a new tab)](https://docs.convex.dev/functions/error-handling/application-errors) to pass error information from your backend to your frontend.

### Email address validation[](#email-address-validation)

Use the `profile` option to `Password` to invoke email validation logic.

This example uses Zod to validate the email format:

### Password validation[](#password-validation)

Use the `validatePasswordRequirements` option to `Password` to invoke password validation logic.

If you don't supply custom validation, the default behavior simply requires that a password is 8 or more characters. If you do supply custom validation, the default validation is not used.

This example requires a certain password length and contents:

## Customize user information[](#customize-user-information)

Your sign-up form can include additional fields, and you can write these to your `users` documents.

To do this, you need to:

1.  [Customize the schema](https://labs.convex.dev/auth/setup/schema) to define the additional fields
2.  Return the additional fields from the `profile` method

This examples sets an additional `role` field received from the frontend:

Replace the built-in `Password` provider with the one we've defined above.

Parametrizing `Password` with your `DataModel` gives you strict type checking for the return value of `profile`.

## Completely customize the sign-in process[](#completely-customize-the-sign-in-process)

You can control entirely the sign-in process on the backend by using the [`ConvexCredentials`](https://labs.convex.dev/auth/api_reference/providers/ConvexCredentials) provider config. See the source of [`Password`](https://labs.convex.dev/auth/api_reference/providers/Password) for an example.

The [server](about:/auth/api_reference/server#createaccountwithcredentials) entrypoint exports a number of functions you can use, and you can also define and call your own mutations.

[OTPs](https://labs.convex.dev/auth/config/otps "OTPs")
[Authorization](https://labs.convex.dev/auth/authz "Authorization")
