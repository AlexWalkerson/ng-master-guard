import { Injectable, Injector } from '@angular/core';
import { CanActivate, CanActivateChild, ActivatedRouteSnapshot, RouterStateSnapshot, Data } from '@angular/router';
import { Observable, from } from 'rxjs';

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
export class MasterGuard implements CanActivate, CanActivateChild {

    private route: ActivatedRouteSnapshot;
    private state: RouterStateSnapshot;
    private executor: 'canActivate' | 'canActivateChild';
    private relation: 'OR' | 'AND' = 'AND';

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
    
    private middleware(): Promise<boolean> {

        let data = this.findDataWithGuards(this.route);         

        if (!data.guards || !data.guards.length) {
            return Promise.resolve(true);
        }

        if(typeof this.route.data.guardsRelation === 'string') {
            this.relation = this.route.data.guardsRelation.toUpperCase() === 'OR' ? 'OR': 'AND';
        } else {
            this.relation = (data.guardsRelation === 'string' && data.guardsRelation.toUpperCase() === 'OR') ? 'OR': 'AND';
        }

        return this.executeGuards(data.guards);
    }

    private findDataWithGuards(route: ActivatedRouteSnapshot): Data {

        if(route.data.guards){
            return route.data;
        }

        if( (route.routeConfig.canActivateChild && ~route.routeConfig.canActivateChild.findIndex(guard => this instanceof guard))
            || (route.routeConfig.canActivate && ~route.routeConfig.canActivate.findIndex(guard => this instanceof guard)) )
        {            
            return route.data;
        }

        return this.findDataWithGuards(route.parent);
    }

    //Execute the guards sent in the route data 
    private executeGuards(guards, guardIndex: number = 0): Promise<boolean> {
        return this.activateGuard(guards[guardIndex])
            .then((result) => {
                if(this.relation === 'AND' && !result)
                    return Promise.resolve(false);
                
                if(this.relation === 'OR' && result)
                    return Promise.resolve(true);

                if (guardIndex < guards.length - 1) {
                    return this.executeGuards(guards, guardIndex + 1);
                } else {
                    return Promise.resolve(result);
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
            
            default:
                result = guard.canActivate(this.route, this.state);
                break;
        }

        if(typeof result === "boolean") 
            return Promise.resolve(result);

        return from(result).toPromise() as Promise<boolean>;
    }
}