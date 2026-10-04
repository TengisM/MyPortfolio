# API-only image, for Render (render.yaml at the repo root). Build from this folder: docker build -t portfolio-api api/
# The embedded site stays the placeholder (see .dockerignore), so the binary serves /api only.

FROM golang:1.27-alpine AS build
WORKDIR /src

# Modules first, so a code change does not re-download them.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Static binary: the runtime image has no libc.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/landing-api ./cmd

# distroless/static has CA certificates, which Neon, Resend and the Vercel hook all need over TLS.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/landing-api /landing-api
USER nonroot:nonroot

# The server listens on $PORT, 3000 when unset.
ENV PORT=3000
EXPOSE 3000
ENTRYPOINT ["/landing-api"]
