"""Reproducible review screenshots. Synthetic data, never a user's browser profile."""
from pathlib import Path
import os
import browser_test as baseline
from mobile_browser_test import DEMO

out=Path(os.environ.get('COACHCONTROL_SCREENSHOTS','/workspace/artifacts/coachcontrol-ui'))
out.mkdir(parents=True,exist_ok=True)
fixture=baseline.BrowserTests
fixture.setUpClass()
case=fixture('test_invalid_form_does_not_write')
try:
    case.setUp();case.login();case.page.evaluate(DEMO)
    for route,name in [('home','home'),('groups','groups'),('payments','payments'),('expenses','expenses')]:
        case.page.evaluate('(route)=>navigate(route)',route)
        case.page.screenshot(path=str(out/(name+'.png')),full_page=False)
    case.page.evaluate('navigate("home");openDrawer()')
    case.page.screenshot(path=str(out/'menu.png'),full_page=False)
    case.page.evaluate('closeDrawer(false)')
    case.page.screenshot(path=str(out/'home-full.png'),full_page=True)
    print(str(out))
finally:
    case.tearDown();fixture.tearDownClass()
