# Windows Manual QA

1. Install the NSIS package on a clean Windows x64 machine and confirm the unsigned internal-test installer can still be launched.
2. Launch the app and confirm the login screen renders.
3. Sign in with a tenant account and confirm initialization succeeds.
4. Send a chat message and confirm the model replies.
5. Open Skills and verify the catalog renders and downloads work.
6. Verify login, initialization, chat, skills, and audit upload all complete successfully without requiring the user to install extra runtimes first.
7. Exit the app, relaunch it, and confirm the login/runtime behavior matches the product spec.
8. Uninstall the app and confirm user runtime data is preserved unless manually deleted.
