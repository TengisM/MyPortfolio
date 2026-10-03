// Package utils holds small, generic helpers.
package utils

import (
	"errors"
	"fmt"
	"reflect"
	"strings"

	"github.com/go-playground/validator/v10"
)

//nolint:gochecknoglobals // singleton validator instance, concurrent-safe
var validate = newValidator()

func newValidator() *validator.Validate {
	v := validator.New()

	v.RegisterTagNameFunc(func(fld reflect.StructField) string {
		name := strings.SplitN(fld.Tag.Get("json"), ",", 2)[0]
		if name == "-" {
			return ""
		}
		return name
	})

	return v
}

// fieldNames maps a JSON field name to the Mongolian label ValidateStruct reports it under.
// honeypot_url is blank on purpose, so a message never tells a bot which field tripped.
var fieldNames = map[string]string{ //nolint:gochecknoglobals // static lookup table
	"name":         "Нэр",
	"email":        "Имэйл",
	"message":      "Мессеж",
	"locale":       "Хэл",
	"honeypot_url": "",
	"elapsed_ms":   "Хугацаа",

	"title":           "Гарчиг",
	"url":             "Холбоос",
	"description_mn":  "Тайлбар (монгол)",
	"description_en":  "Тайлбар (англи)",
	"kind":            "Төрөл",
	"organization_mn": "Байгууллага (монгол)",
	"organization_en": "Байгууллага (англи)",
	"position_mn":     "Албан тушаал (монгол)",
	"position_en":     "Албан тушаал (англи)",
	"start_date":      "Эхэлсэн огноо",
	"end_date":        "Дууссан огноо",
	"ids":             "Жагсаалт",
	"data_base64":     "Лого",
}

// ValidateStruct runs the struct tags on s and returns a Mongolian message describing the first
// violation, or "" when s is valid.
func ValidateStruct(s any) string {
	err := validate.Struct(s)
	if err == nil {
		return ""
	}

	var validationErrors validator.ValidationErrors
	if !errors.As(err, &validationErrors) {
		return "Баталгаажуулалтын алдаа"
	}

	fe := validationErrors[0]

	field := fe.Field()
	name, exists := fieldNames[field]
	if !exists {
		name = field
	}

	switch fe.Tag() {
	case "required":
		return name + " заавал оруулна уу"
	case "email":
		return name + " зөв имэйл хаяг байх ёстой"
	case "min":
		return fmt.Sprintf("%s хамгийн багадаа %s тэмдэгт байх ёстой", name, fe.Param())
	case "max":
		return fmt.Sprintf("%s хамгийн ихдээ %s тэмдэгт байх ёстой", name, fe.Param())
	default:
		return name + " буруу байна"
	}
}
