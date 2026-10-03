package content

import (
	"strings"
	"time"

	"landing-api/internal/http/models"
	"landing-api/internal/utils"
)

// ParseProject trims and validates a project body. It returns a Mongolian message on failure. The
// handlers and import-content share it, so an imported file meets the same rules as the panel.
func ParseProject(req models.RqProject) (ProjectInput, string) {
	req.Title = strings.TrimSpace(req.Title)
	req.URL = strings.TrimSpace(req.URL)
	req.DescriptionMn = strings.TrimSpace(req.DescriptionMn)
	req.DescriptionEn = strings.TrimSpace(req.DescriptionEn)

	if msg := utils.ValidateStruct(req); msg != "" {
		return ProjectInput{}, msg
	}
	// http_url also takes other schemes with a host, such as ftp://.
	lower := strings.ToLower(req.URL)
	if !strings.HasPrefix(lower, "http://") && !strings.HasPrefix(lower, "https://") {
		return ProjectInput{}, "Холбоос http:// эсвэл https://-ээр эхлэх ёстой"
	}

	return ProjectInput{
		Title:         req.Title,
		URL:           req.URL,
		DescriptionMn: req.DescriptionMn,
		DescriptionEn: req.DescriptionEn,
		Published:     req.Published == nil || *req.Published,
	}, ""
}

// ParseExperience trims and validates an experience body. It returns a Mongolian message on failure.
func ParseExperience(req models.RqExperience) (ExperienceInput, string) {
	req.OrganizationMn = strings.TrimSpace(req.OrganizationMn)
	req.OrganizationEn = strings.TrimSpace(req.OrganizationEn)
	req.PositionMn = strings.TrimSpace(req.PositionMn)
	req.PositionEn = strings.TrimSpace(req.PositionEn)
	req.DescriptionMn = strings.TrimSpace(req.DescriptionMn)
	req.DescriptionEn = strings.TrimSpace(req.DescriptionEn)
	// An empty end_date from a cleared form field means "current", the same as null.
	if req.EndDate != nil && strings.TrimSpace(*req.EndDate) == "" {
		req.EndDate = nil
	}

	if msg := utils.ValidateStruct(req); msg != "" {
		return ExperienceInput{}, msg
	}

	// The validator has already checked both layouts, so these cannot fail.
	start, _ := time.Parse(models.DateLayout, req.StartDate)
	var end *time.Time
	if req.EndDate != nil {
		parsed, _ := time.Parse(models.DateLayout, *req.EndDate)
		if parsed.Before(start) {
			return ExperienceInput{}, "Дууссан огноо эхэлсэн огнооноос өмнө байж болохгүй"
		}
		end = &parsed
	}

	return ExperienceInput{
		Kind:           req.Kind,
		OrganizationMn: req.OrganizationMn,
		OrganizationEn: req.OrganizationEn,
		PositionMn:     req.PositionMn,
		PositionEn:     req.PositionEn,
		DescriptionMn:  req.DescriptionMn,
		DescriptionEn:  req.DescriptionEn,
		StartDate:      start,
		EndDate:        end,
		Published:      req.Published == nil || *req.Published,
	}, ""
}
