"""RTCIOC prompt assembly — Role, Task, Input, Output, Constraints, Capabilities/reminders."""

from __future__ import annotations

SECTION_ROLE = "## Role"
SECTION_TASK = "## Task"
SECTION_INPUT = "## Input"
SECTION_OUTPUT = "## Output"
SECTION_CONSTRAINTS = "## Constraints"
SECTION_CAPABILITIES = "## Capabilities and reminders"

RTCIOC_SECTIONS = (
    SECTION_ROLE,
    SECTION_TASK,
    SECTION_INPUT,
    SECTION_OUTPUT,
    SECTION_CONSTRAINTS,
    SECTION_CAPABILITIES,
)


def build_instructions(
    *,
    role: str,
    task: str,
    input_desc: str,
    output_desc: str,
    constraints: list[str],
    capabilities: list[str],
    reminders: list[str],
) -> str:
    """Assemble agent instructions in fixed RTCIOC order.

    Reminders are appended last inside Capabilities — highest-priority rules
    should appear at the bottom of ``reminders``.
    """
    constraint_block = "\n".join(f"- {c}" for c in constraints) if constraints else "- None"
    cap_lines = list(capabilities) + list(reminders)
    cap_block = "\n".join(f"- {c}" for c in cap_lines) if cap_lines else "- None"

    return (
        f"{SECTION_ROLE}\n{role.strip()}\n\n"
        f"{SECTION_TASK}\n{task.strip()}\n\n"
        f"{SECTION_INPUT}\n{input_desc.strip()}\n\n"
        f"{SECTION_OUTPUT}\n{output_desc.strip()}\n\n"
        f"{SECTION_CONSTRAINTS}\n{constraint_block}\n\n"
        f"{SECTION_CAPABILITIES}\n{cap_block}"
    )
