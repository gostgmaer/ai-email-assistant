from app.capabilities.contact_memory.nodes import _facts_to_text


def test_facts_to_text_includes_all_present_fields():
    facts = {
        "role": "hiring manager",
        "company": "Acme Inc.",
        "summary": "Discussing an interview for August 6th.",
        "commitments": ["Send the calendar invite once confirmed."],
    }

    text = _facts_to_text(facts)

    assert "Discussing an interview for August 6th." in text
    assert "Role: hiring manager" in text
    assert "Company: Acme Inc." in text
    assert "Send the calendar invite once confirmed." in text


def test_facts_to_text_omits_missing_optional_fields():
    facts = {
        "role": None,
        "company": None,
        "summary": "Just a quick hello.",
        "commitments": [],
    }

    text = _facts_to_text(facts)

    assert text == "Just a quick hello."
    assert "Role:" not in text
    assert "Company:" not in text
    assert "Commitments:" not in text
