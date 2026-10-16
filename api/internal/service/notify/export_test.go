package notify

// BuildSubject exposes buildSubject to tests.
var BuildSubject = buildSubject

// NewResendAt exposes newResend, so a test can point it at a local server.
var NewResendAt = newResend
