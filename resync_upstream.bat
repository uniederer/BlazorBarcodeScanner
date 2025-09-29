@echo off
git checkout master
git fetch upstream
git pull upstream master
git push

pause