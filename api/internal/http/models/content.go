package models

import (
	"time"

	"github.com/google/uuid"
)

// DateLayout is the wire format of every experience date.
const DateLayout = "2006-01-02"

// MaxLogoBytes caps a decoded logo. main's BodyLimit must leave room for it in base64.
const MaxLogoBytes = 1 << 20

// RqProject is the body of POST and PUT /api/admin/projects.
type RqProject struct {
	Title         string `json:"title"          validate:"required,max=200"`
	URL           string `json:"url"            validate:"required,max=2000,http_url"`
	DescriptionMn string `json:"description_mn" validate:"max=2000"`
	DescriptionEn string `json:"description_en" validate:"max=2000"`
	// Published is a pointer so an omitted field means true, the column default, and not false.
	Published *bool `json:"published"`
}

// RqProjectLogo is the body of PUT /api/admin/projects/:id/logo. ContentType is only a hint: the
// server sniffs the bytes and stores what it finds.
type RqProjectLogo struct {
	ContentType string `json:"content_type"`
	DataBase64  string `json:"data_base64" validate:"required"`
}

// RqReorder is the body of POST /api/admin/projects/reorder.
type RqReorder struct {
	IDs []uuid.UUID `json:"ids" validate:"required"`
}

// RqExperience is the body of POST and PUT /api/admin/experience.
type RqExperience struct {
	Kind           string  `json:"kind"            validate:"required,oneof=work education"`
	OrganizationMn string  `json:"organization_mn" validate:"required,max=200"`
	OrganizationEn string  `json:"organization_en" validate:"required,max=200"`
	PositionMn     string  `json:"position_mn"     validate:"required,max=200"`
	PositionEn     string  `json:"position_en"     validate:"required,max=200"`
	DescriptionMn  string  `json:"description_mn"  validate:"max=2000"`
	DescriptionEn  string  `json:"description_en"  validate:"max=2000"`
	StartDate      string  `json:"start_date"      validate:"required,datetime=2006-01-02"`
	EndDate        *string `json:"end_date"        validate:"omitempty,datetime=2006-01-02"`
	Published      *bool   `json:"published"`
}

// RsAdminProject is one project as the admin panel sees it.
type RsAdminProject struct {
	ID            uuid.UUID `json:"id"`
	Title         string    `json:"title"`
	URL           string    `json:"url"`
	DescriptionMn string    `json:"description_mn"`
	DescriptionEn string    `json:"description_en"`
	Published     bool      `json:"published"`
	SortOrder     int32     `json:"sort_order"`
	LogoURL       *string   `json:"logo_url"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// RsAdminExperience is one experience row as the admin panel sees it.
type RsAdminExperience struct {
	ID             uuid.UUID `json:"id"`
	Kind           string    `json:"kind"`
	OrganizationMn string    `json:"organization_mn"`
	OrganizationEn string    `json:"organization_en"`
	PositionMn     string    `json:"position_mn"`
	PositionEn     string    `json:"position_en"`
	DescriptionMn  string    `json:"description_mn"`
	DescriptionEn  string    `json:"description_en"`
	StartDate      string    `json:"start_date"`
	EndDate        *string   `json:"end_date"`
	Published      bool      `json:"published"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// RsList wraps an admin list. Items is never nil, so it never marshals to null.
type RsList[T any] struct {
	Items []T `json:"items"`
}

// Localized is one text in both site languages.
type Localized struct {
	Mn string `json:"mn"`
	En string `json:"en"`
}

// RsContent is GET /api/content: the shape of src/content/content.json, which the build script
// writes from it. Change both together.
type RsContent struct {
	Projects   []RsContentProject    `json:"projects"`
	Experience []RsContentExperience `json:"experience"`
}

// RsContentProject is one published project. Logo is a URL path, or null.
type RsContentProject struct {
	ID          uuid.UUID `json:"id"`
	Title       string    `json:"title"`
	URL         string    `json:"url"`
	Logo        *string   `json:"logo"`
	Description Localized `json:"description"`
}

// RsContentExperience is one published experience row.
type RsContentExperience struct {
	ID           uuid.UUID `json:"id"`
	Kind         string    `json:"kind"`
	Organization Localized `json:"organization"`
	Position     Localized `json:"position"`
	Description  Localized `json:"description"`
	StartDate    string    `json:"start_date"`
	EndDate      *string   `json:"end_date"`
}
