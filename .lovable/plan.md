I found the cause: the `rubric_scores` table has **0 rows**, while the existing final grades table already has Midterm and Final totals for 32 students each. So the total scores are saved, but the per-criterion rubric boxes were never saved/backfilled.

Plan:
1. Backfill `rubric_scores` from existing Midterm/Final grades:
   - For each saved Midterm Presentation grade, create rubric criteria scores that calculate back to the saved score out of 30.
   - For each saved Final Project grade, create rubric criteria scores that calculate back to the saved score out of 40.
   - Use the same percentage for each criterion because the old data only contains the final total, not individual criterion breakdowns.
2. Update the rubric dialog load/save behavior:
   - When a group assignment rubric is saved, save the rubric detail for every group member, matching how the final grade is already saved for every group member.
   - Keep the current localStorage fallback, but the database becomes the source of truth.
3. Verify:
   - Confirm `rubric_scores` has rows for both Midterm Presentation and Final Project.
   - Confirm opening either rubric shows prefilled values instead of empty inputs.