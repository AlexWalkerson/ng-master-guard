import { Injectable, Injector } from '@angular/core';
import { CanActivate, CanActivateChild, CanLoad, ActivatedRouteSnapshot, RouterStateSnapshot, Route, UrlSegment } from '@angular/router';
import { Observable, of, from } from 'rxjs';

/**
 * Guard that makes it possible to use sequential chain of async guards
 * Example: 
 *
 *     import { Guard1, Guard2, Guard3 } from '@appRoot/guards';
 *     ...
 *     Single route
 *          {
 *              path: 'one', 
 *              canActivate: [MasterGuard], 
 *              data: { guards: [Guard1, Guard2, Guard3], guardsRelation: 'AND' }, 
 *          },
 *      Child Routes:
 *          {
 *              path: 'parent', 
 *              canActivateChild: [MasterGuard], 
 *              data: {guards: [Guard1, Guard2, Guard3]}, 
 *              children: [
 *                  { path: 'child1', component: ChildComponent }, 
 *                  //override guards and their relation
 *                  { path: 'child2', component: ChildComponent, data: {guards: [Guard1, Guard2], guardsRelation: 'OR'} },
 *              ]
 *          },
 */
@Injectable()
export class MasterGuard implements CanActivate, CanActivateChild, CanLoad {

    private route: ActivatedRouteSnapshot | Route;
    private state: RouterStateSnapshot;
    private segments: UrlSegment[];
    private executor: 'canActivate' | 'canActivateChild' | 'canLoad';

    constructor(private injector: Injector) {}

    public canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean> {
        this.executor = 'canActivate';
        this.route = route;
        this.state = state;
        return this.middleware();
    }

    public canActivateChild(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean> {
        this.executor = 'canActivateChild';
        this.route = route;
        this.state = state;
        return this.middleware();
    }

    public canLoad(route: Route, segments: UrlSegment[]): Promise<boolean> {
        this.executor = 'canLoad';
        this.route = route;
        this.segments = segments;
        return this.middleware();
    }

    private get relation(): 'OR' | 'AND'{
        return (this.route.data && typeof this.route.data.guardsRelation === 'string' && this.route.data.guardsRelation.toUpperCase() === 'OR')? 'OR': 'AND';
    }

    private middleware(): Promise<boolean> {
        if (!this.route.data || !Array.isArray(this.route.data.guards)) {
            return Promise.resolve(true);
        }

        return this.executeGuards();
    }

    //Execute the guards sent in the route data 
    private executeGuards(guardIndex: number = 0): Promise<boolean> {
        return this.activateGuard(this.route.data.guards[guardIndex])
            .then((intermediateResult) => {
                if(this.relation === 'AND' && !intermediateResult)
                    return Promise.resolve(false);
                
                if(this.relation === 'OR' && intermediateResult)
                    return Promise.resolve(true);

                if (guardIndex < this.route.data.guards.length - 1) {
                    return this.executeGuards(guardIndex + 1);
                } else {
                    return Promise.resolve(intermediateResult);
                }
            })
            .catch(() => {
                return Promise.reject(false);
            });
    }

    private activateGuard(token): Promise<boolean> {
        let guard = this.injector.get(token);

        let result: Observable<boolean> | Promise<boolean> | boolean;
        switch (this.executor) {
            case 'canActivate':
                result = guard.canActivate(this.route, this.state);
                break;

            case 'canActivateChild':
                result = guard.canActivateChild(this.route, this.state);
                break;

            case 'canLoad':
                result = guard.canLoad(this.route, this.segments);
                break;
            
            default:
                result = guard.canActivate(this.route, this.state);
                break;
        }

        if(typeof result === "boolean") 
            return Promise.resolve(result);

        return from(result).toPromise() as Promise<boolean>;
    }
}