#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================
# (protocol preserved - see git history)
#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

user_problem_statement: |
  Add Edit/Delete capability for Tasks (My Work) — was missed in the previous
  batch where Events and Announcements got edit/delete but Tasks did not.
  Backend must enforce author/admin permissions consistent with Events/Announcements.
  Frontend: tap a task card to open bottom sheet with edit fields + delete button
  (double-tap-to-confirm), matching the announcements/events UX.

backend:
  - task: "PATCH /api/tasks/{task_id} with author/officer/assignee permission gate"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added permission gate: officers (President/VP/Secretary), author (created_by/created_by_name matches user), or assignee can edit. Status-only mutations remain open to all committee members so anyone can check off / cycle status."

  - task: "DELETE /api/tasks/{task_id} restricted to officers or author"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added 403 for non-officer, non-author users. Committee scoping preserved via cscope(user)."

frontend:
  - task: "Tasks screen edit/delete bottom sheet"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/tasks.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Card row Pressable now opens the same BottomSheet as new-task with pre-filled title/description/priority when the user is officer/author/assignee. Delete button (double-tap-to-confirm) shown only to officer/author. testIDs: task-row-{id}, task-sheet, save-task-button, delete-task-button."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 12
  run_ui: false

test_plan:
  current_focus:
    - "PATCH /api/tasks/{task_id} with author/officer/assignee permission gate"
    - "DELETE /api/tasks/{task_id} restricted to officers or author"
    - "Tasks screen edit/delete bottom sheet"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Added Edit/Delete for Tasks (was missed in previous iteration where Events + Announcements got it).
      Backend: PATCH now allows status-only writes for all committee members; other field edits require
      officer / author / assignee. DELETE requires officer or author. Frontend Tasks tab: tapping a task
      row opens the sheet pre-filled for edit; save re-uses api.updateTask; delete uses api.deleteTask
      with a confirm-tap pattern (same UX as announcements/events).
      Please regression-test:
        1. Create task as user A → user A can edit + delete.
        2. User B (non-officer, non-assignee) tries PATCH title → 403.
        3. User B assigned as assignee can PATCH status/description (not delete).
        4. User B (Regular Member) status toggle still works via short PATCH (status-only).
        5. Officer can delete anyone's task.
        6. Delete cascades: verify only that task removed, others untouched, committee scoping intact.
      Frontend: verify no regression in create-task, check-off, status-cycle chip on Tasks tab.
